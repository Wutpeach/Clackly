# A/B test persistent Python export worker

## Goal

Determine whether a restartable persistent managed-Python worker can reduce warm Export-to-AE latency from the measured approximately 465 ms baseline to 200 ms or less without changing export output, weakening failure isolation, or coupling it to the separate PowerShell After Effects process helper.

## Background

- The archived local-project baseline measured default mixed export at a 464.559 ms median and audio-only at 470.011 ms. The isolated Python process accounted for approximately 413-415 ms.
- Measured Resolve work is modest: connection approximately 32-34 ms, project/timeline acquisition approximately 2.5 ms, both track scans approximately 17-18 ms, mixed OTIO export/parse approximately 9 ms, and clip-data/JSX approximately 2 ms.
- Approximately 344-354 ms is associated with the short-lived interpreter, Bootstrap/runner, entry imports, platform/LUT setup, and outer process envelope.
- The existing `RuntimeLauncher` deliberately starts one isolated worker per request and remains authoritative for Runtime Probe operations. It must not be converted into a pool.
- The smallest experiment seam is the one `RuntimeManager` business-script launch call. Arm A remains the current `RuntimeLauncher`; arm B uses a dedicated `PersistentScriptLauncher` with the same response/process contract.
- The PowerShell AE process helper remains a separate host-owned child. The two workers may follow similar supervision concepts but must not be combined into one process or a premature generic supervisor abstraction.

## Requirements

- Implement a reversible B-arm launcher only for Export-to-AE business `script-execute`; Runtime Probe, readiness cache, Python Provider, public Capability result, generated JSX, and After Effects launch ownership remain unchanged.
- Prewarm the B worker asynchronously after host readiness without connecting to Resolve or delaying Palette, IPC, hotkey, or Workflow readiness. The first user export sends a distinct request to the already-ready worker.
- Use one managed interpreter with a strict READY handshake, monotonically increasing request ids, one UTF-8 JSON request/response frame per command, exact schemas, output bounds, and `shell: false`/hidden isolated environment matching the current Runtime contract.
- Serialize B-arm requests with one in-flight command. A second command waits FIFO; the A/B real-host procedure remains strictly user-serial.
- Preserve the parent-owned 10-second per-command timeout. Timeout, native crash, child exit/EOF, wrong id, malformed output, or output overflow kills the B worker, fails the current command without retry, rejects already queued work, and permits only a later command to create one replacement worker.
- Reacquire Resolve, current project, and current timeline for every request. Do not cache Resolve objects, configuration, project state, timeline state, clip data, JSX, or command results between commands.
- Key worker health to the canonical interpreter identity and live Resolve/runtime inputs. A changed identity kills and replaces the worker before dispatch. A same-version Resolve restart may fail at most the first export; failure must kill the worker so the next command starts cleanly.
- Preserve per-command ScriptContext, logger capture, stdout/stderr restoration, JSON validation, private desktop launch directive stripping, and exact public results.
- Keep the PowerShell process helper unchanged and separate. Do not extract a generic child-process supervisor while there are only two materially different consumers.
- Compare B against the archived corrected A evidence on the same local timeline shape when possible. Collect one labeled warm-up and at least five, preferably eight, steady default mixed and audio-only samples; video-only remains optional and cannot support a comparative claim without an A baseline.
- Remove all A/B diagnostic switching and profiling after the experiment unless the user separately approves product adoption. Rebuild and reinstall the clean A Workflow after an inconclusive or failed experiment.

## Acceptance Criteria

- [ ] Automated tests cover READY, strict request/response schema, wrong ids, timeout kill, output bounds, crash/EOF, FIFO serialization, queue rejection on worker death, idempotent disposal, health-key replacement, and next-command restart.
- [ ] A and B produce byte-identical public result and JSX snapshots for every supported Export-to-AE policy; Python Provider, Runtime Probe, and AE process-helper tests remain unchanged and green.
- [ ] A forced B-worker timeout fails that command at approximately 10 seconds with no retry, and the next command succeeds through exactly one replacement worker.
- [ ] A Resolve restart test causes no stale successful export: at worst one controlled failure, followed by success from a replacement worker.
- [ ] B default mixed median command latency is at most 200 ms, improves on the archived A median by at least 250 ms, and has Python-process median at most 35% of A.
- [ ] All sampled exports succeed and the user confirms that the AE composition has the same layers, order, names, timing, and transforms.
- [ ] Memory/state does not grow without bound in an automated repeated-request soak, and application shutdown leaves no Python child process.
- [ ] Failed/inconclusive B restores the clean A package; successful B remains a candidate only until a separate adoption decision.

## Out of Scope

- Combining the Python worker with the PowerShell AE process helper.
- Changing Resolve2AE selection, range, OTIO, media policies, JSX formulas, Runtime Probe, public errors, or the 10-second timeout.
- Retrying the command that timed out or crashed.
- Extracting a generic process-supervisor framework before a third compatible consumer exists.
- Permanently adopting B, optimizing unused scans/`platform.system()`, or fixing the intermittent audio timeout in this experiment.

## Decisions

- The user approved automatic background prewarm on 2026-08-30. Prewarm starts and prepares the managed interpreter without connecting to Resolve or delaying host readiness.
- The user approved one possible controlled first failure after a same-version Resolve restart. That failure kills the worker; the next export must start a replacement and succeed without retrying the failed command.
- The user selected bounded FIFO waiting for overlapping exports. Real-host sampling remains strictly serial, while automated tests own the concurrency behavior.
- The B diagnostic package is compared with the archived corrected A evidence, then the clean A package is restored regardless of the result. Permanent B adoption requires a separate decision.
