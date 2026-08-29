# After Effects Running-State Detection Design

## Design Summary

Replace per-export PowerShell startup with one host-owned Windows process-probe helper. The helper is prewarmed in the background after Electron becomes ready, completes one real process enumeration whose result is discarded, and remains alive only for the Clackly host lifetime. Every Export-to-AE command sends its own new bounded query; Node continues to validate returned executable paths and owns the final running/stopped/unknown decision.

This preserves the existing host-owned desktop launch boundary and avoids new native dependencies. The helper is a process-query transport, not a state cache and not a desktop launcher.

## Ownership and Data Flow

```text
Electron host ready
  -> Clackly Core prewarm
  -> WindowsAfterEffectsProcessProbe starts hidden PowerShell helper
  -> READY handshake (background; Palette/IPC/hotkey do not wait)
  -> fresh QUERY <warm-up-id>; discard its response

Export-to-AE desktop plan
  -> AfterEffectsLauncher validates configured and plan executables
  -> process probe QUERY <request-id>
  -> helper runs fresh Get-Process -Name AfterFX path enumeration
  -> bounded response { requestId, processCount, records[] }
  -> Node validates response and canonicalizes every readable path
  -> exact match: warm send
  -> no candidates / all valid nonmatches: cold launch
  -> unreadable/malformed/timeout without match: fail closed, no launch

Electron will-quit
  -> Clackly Core dispose
  -> helper stdin closes and child is terminated
```

`RuntimeManager`, PythonProvider, the isolated Python worker, and the internal JSX launch-plan schema remain unchanged.

## Helper Contract

### Process Construction

- Windows executable: canonical `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`.
- Fixed arguments: `-NoLogo -NoProfile -NonInteractive -EncodedCommand <fixed-script>`.
- Options: `shell: false`, `windowsHide: true`, inherited host environment, and piped stdin/stdout.
- The fixed script accepts only protocol commands; no configured AE path, JSX, configuration value, or arbitrary command text crosses stdin.

### Protocol

- Startup emits exactly one versioned `READY` line.
- Node sends one positive safe-integer request id per `QUERY` line.
- Each response is one compact JSON line:

```json
{
  "requestId": 1,
  "processCount": 1,
  "records": [{ "path": "C:\\Program Files\\Adobe\\AfterFX.exe", "status": "ok" }]
}
```

- An unreadable candidate uses a stable `status: "unresolved"` and no raw exception text.
- An overall enumeration failure returns a stable error token or terminates the helper; Node maps either to the existing `AFTER_EFFECTS_LAUNCH_FAILED` unknown-state behavior.
- Node rejects wrong request ids, extra/unknown fields, invalid counts, malformed records, duplicate terminal responses, non-UTF-8/malformed JSON, oversized lines, and record-count overflow.

The concrete limits are implementation constants with tests: startup/query timeout no weaker than the current 5-second bound, maximum response bytes at most the existing 1 MiB `runExecFile` bound, and a finite candidate-record cap. A limit breach kills the helper and fails the current command closed.

## State and Concurrency

The probe owns only helper lifecycle state: child reference, startup promise, one in-flight prewarm promise, monotonically increasing request id, query queue, and disposed flag. It owns no AE running-state cache.

- `prewarm()` enqueues exactly one real fresh query after startup and discards only that response. A concurrent user query serializes behind it and receives the next response, so prewarm cannot create duplicate helpers or leak a cached state.
- Queries are serialized; each command still receives a fresh process enumeration.
- A startup, protocol, timeout, or child-exit failure rejects the current query, clears helper state, and performs no retry for that export.
- A later export may start one new helper. This is recovery for a later command, not an execution retry.
- `dispose()` rejects pending work and terminates the child idempotently.
- EOF on stdin also makes the PowerShell loop exit, reducing orphan risk if the parent disappears unexpectedly.

## Integration Boundary

`AfterEffectsLauncher` receives a process-probe collaborator and reuses its existing canonical-file and same-path validation. Its warm/cold execution code and cleanup behavior do not change.

`createClacklyCore()` owns one probe/launcher instance and exposes narrow lifecycle functions for prewarm and disposal. Both standalone and Workflow hosts invoke prewarm after Electron readiness without awaiting it, and invoke disposal during `will-quit`. Shared startup composition remains non-blocking.

Non-Windows behavior remains the existing no-probe `false` result.

## Compatibility and Error Semantics

- Public Capability, Provider, IPC, and command results remain unchanged.
- A matching configured executable wins even if another `AfterFX` path is unresolved.
- Without a validated match, any unresolved candidate remains unknown/failure.
- A different installed `AfterFX.exe` remains a valid nonmatch and cannot suppress the configured cold launch.
- Unknown state cleans the temporary JSX and creates neither AE process nor startup bootstrap.
- No logging includes process paths, configuration, JSX, or raw PowerShell errors.

## Performance Qualification

The implementation will expose no product profiling surface. A test/qualification harness may instantiate the real probe and measure startup, the discarded prewarm query, the first user query, and at least five steady queries separately. The steady median must be at most 50 ms on the profiling machine; the research candidate measured 4.7 ms.

The packaged candidate must then be installed before a user-owned local Resolve/AE smoke. The smoke checks successful warm export and visible latency improvement without reintroducing retained diagnostic instrumentation.

## Rollout and Rollback

1. Implement and unit-test the probe and unchanged launcher semantics.
2. Integrate non-blocking prewarm and deterministic disposal in both hosts.
3. Run focused and full automated checks plus the real helper latency qualification.
4. Stage Runtime, package, verify, and install the candidate.
5. Ask the user to start AE and Resolve and validate with a local project.

Rollback removes the helper module/lifecycle wiring and restores the existing per-export `runExecFile` detector. No configuration migration or data cleanup is required.

## Rejected Alternatives

- **AE-state TTL cache:** may return stale running state and does not satisfy a fresh query per export.
- **Move detection into Python:** violates the host-owned desktop boundary and couples OS process inspection to the isolated business worker.
- **Native Node addon/helper:** could be faster but adds Electron ABI, packaging, signing, and maintenance risk before the low-dependency helper experiment is tried.
- **`tasklist` image-name check:** cannot preserve exact configured executable-path identity.
