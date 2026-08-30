# Persistent Python Export Worker A/B Design

## Design summary

Add a dedicated, temporary `PersistentScriptLauncher` for Export-to-AE business execution while keeping `RuntimeLauncher` authoritative for Runtime Probe and the A baseline. The B launcher exposes the same `execute({ resolution, bootstrapPath, request }) -> { response, process }` shape consumed by `RuntimeManager`, so Provider, Capability, public results, Python ScriptContext, JSX, and After Effects desktop launch remain unchanged.

The experiment uses the archived corrected A evidence and installs only one B diagnostic package. After sampling, remove the B launcher, temporary measurements, and packaging additions, then rebuild and reinstall clean A. A successful B result is evidence for a separate adoption task, not permission to leave the experiment installed.

## Ownership and composition

- `RuntimeLauncher` remains stateless and one-process-per-operation. Runtime Probe and availability never use B.
- `PersistentScriptLauncher` is a separate Runtime-owned collaborator used only for `script-execute` requests from the Export-to-AE Capability.
- `RuntimeManager` receives an optional business `scriptLauncher`; its existing `launcher` remains the Probe/one-shot launcher. The script call site is the only business routing seam.
- `createClacklyCore()` owns the B launcher and exposes narrow `prewarmExportPythonWorker()` and `disposeExportPythonWorker()` lifecycle methods.
- Both Electron hosts schedule non-blocking prewarm after readiness and dispose the Python worker during `will-quit`, beside but separate from the PowerShell helper lifecycle.
- Do not extract a generic pipe-child supervisor. The PowerShell and Python children share a recipe but have different protocols, owners, timers, payloads, environments, and failure mappings.

## Worker protocol

The parent launches the canonical managed interpreter with fixed `-I -u -X faulthandler` flags, `shell: false`, hidden pipes, the existing isolated environment allowlist, and one worker-lifetime temporary directory.

### Startup and preparation

1. `persistent_bootstrap.py` loads only standard Runtime infrastructure and prints one versioned READY frame on real stdout.
2. The parent validates READY under a bounded startup timer.
3. Background prewarm sends a strict `prepare` request containing a safe request id plus validated script root and relative entry through stdin, never argv or logs.
4. Preparation validates containment, loads the runner and Export-to-AE entry dependencies, and warms platform identity without calling feature `execute()`, `scriptapp()`, project, timeline, configuration, or AE launch.
5. The worker returns one strict PREPARED response. Prewarm discards business output because none exists. The first user export always receives a distinct request id.

### Business requests

Request: `{ requestId, operation: "script-execute", scriptRoot, entry, commandId, config }` as one UTF-8 JSON line. Response: `{ requestId, ok, runtime, script }` as one UTF-8 JSON line, where `script` is the existing runner envelope.

- Request ids are positive safe integers and monotonically increase per worker.
- Schemas reject unknown fields, non-standard JSON numbers, malformed UTF-8, wrong ids, extra stdout frames, and oversized lines/streams.
- Stdout is protocol-only. Stderr is bounded diagnostics and retains existing native-crash classification without exposing config, paths, or JSX to normal logs.
- One request is active at a time. Later requests wait in a bounded FIFO queue. Queue capacity is explicit; overflow fails before sending and does not affect active work.

## Per-request state and Resolve lifecycle

Every business request creates a new ScriptContext, logger capture, stdout/stderr redirection, config snapshot, and lazy Resolve state. It calls `scriptapp("Resolve")` and reacquires current project and timeline for that request. No Resolve/project/timeline objects, config, clip facts, JSX, results, or log records persist between commands.

Imported standard-library, runner, Resolve2AE, adapter, and native bridge modules may remain loaded. Module-level mutable state must be audited and must not grow with request count.

Worker health is keyed to canonical executable identity/mtime, Resolve version, and canonical bridge module/library identity. A changed key kills and replaces the worker before dispatch. After a same-version Resolve restart, a controlled connection/version failure, timeout, or crash kills the worker; the first command is not retried, and the next command starts one replacement.

## Timeout, failure, and cleanup

- The 10,000 ms deadline starts when a request is written, not while it waits in FIFO.
- Timeout/output overflow/protocol violation/native crash/child exit/EOF kills the child once, waits for close, fails the active request with the existing Runtime error family, rejects queued requests without sending, and cleans the worker temporary directory.
- A failed request is never retried. Only a later new command may lazily start one replacement.
- `dispose()` is idempotent: reject active/queued work, end stdin so the loop can exit on EOF, force-kill if needed, wait for close, and remove the worker directory. No child survives host shutdown.
- Prewarm failure is non-blocking and contained. The first user command may attempt one fresh worker; it does not retry a command that had already been sent.

## A/B measurement

Use the archived A evidence (default 464.559 ms total/415 ms Python; audio 470.011 ms/412.5 ms). Add a temporary bounded B recorder containing only stable command/outcome/worker-state tokens, counts, and monotonic durations. It must not contain names, paths, config, JSX, or raw errors.

With AE running and the same local timeline shape, capture one labeled B warm-up and at least five, preferably eight, steady samples for default mixed and audio-only. Sampling is serial. Video-only is optional and cannot support an A/B claim because no corrected A baseline exists.

B passes performance only if default mixed median is at most 200 ms, improves by at least 250 ms over A, and B Python request median is at most 35% of A. Correctness additionally requires byte-identical result/JSX snapshots, successful user AE-comp inspection, forced-timeout recovery, same-version Resolve restart recovery, bounded memory soak, and no orphan process.

## Rollout and rollback

1. Implement B behind the single RuntimeManager injection seam and add exhaustive fake/real worker tests.
2. Add temporary bounded B measurement and qualify source.
3. Stage Runtime, package, verify, and install B only while Resolve/AE are closed.
4. Ask the user for serial local-project samples and the explicit timeout/restart gates.
5. Retain bounded evidence and decide pass/fail without adopting B.
6. Remove B plus diagnostics and packaging additions, rerun all checks, rebuild, and reinstall clean A.

Any public-result/JSX drift, retry, unbounded output/memory, orphan process, failure to recover on the next command, median above the performance gates, or Resolve/AE regression fails B and triggers immediate clean-A restoration.
