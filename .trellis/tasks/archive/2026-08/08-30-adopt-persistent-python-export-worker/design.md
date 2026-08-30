# Persistent Python Export Worker Adoption Design

## Summary

Recreate the measured B worker as a permanent Runtime-owned collaborator used only by the three current Windows Export-to-AE business commands. Keep the existing one-shot `RuntimeLauncher` authoritative for Runtime Probe and every unrelated script. Both Electron hosts create the same worker through `createClacklyCore()`, start a best-effort no-Resolve preparation after readiness, and dispose it during `will-quit`.

The PowerShell AE process helper remains a separate host-owned process and module. This task shares only narrow stateless helpers where identical behavior prevents drift; it does not introduce a shared process supervisor or modify the PowerShell state machine.

## Product execution flow

```text
Command
  -> ScriptCapabilityProvider / PythonProvider
  -> RuntimeManager resolves and probes with the one-shot Runtime path
  -> exact Windows Export-to-AE route selects PersistentScriptLauncher
  -> persistent_bootstrap.py executes one request through python_runner
  -> RuntimeManager validates the existing script envelope
  -> host-owned AfterEffectsLauncher performs a fresh PowerShell process query
  -> public result/log contract remains unchanged
```

The route requires all of: Windows, capability `ae.export`, the fixed `scripts/resolve2ae_export.py` entry, and one of the three supported Command ids. A missing collaborator, another platform, another capability, or another entry uses the existing one-shot launcher.

## Export command contraction

The permanent product surface and Runtime route contain exactly three actions:

| Command | Media policy | Range behavior |
| --- | --- | --- |
| `timeline.exportToAfterEffects` | mixed | eligible Blue duration range, otherwise automatic playhead selection |
| `timeline.exportAudioToAfterEffects` | audio | eligible Blue duration range, otherwise automatic playhead selection |
| `timeline.exportVideoToAfterEffects` | video | eligible Blue duration range, otherwise automatic playhead selection |

The internal `exportCurrentToAfterEffects`, `exportBlueRangeToAfterEffects`, and `exportCyanRangeToAfterEffects` ids are removed from Command metadata and the Python policy map. Cyan markers remain ignored. The legacy Cyan id is not reinterpreted as a Blue mixed-range product action.

`BindingStorage` remains the one-time compatibility boundary. Exact historical shipped-default shapes rewrite directly to `DEFAULT_BINDINGS`. Customized legacy roots are backed up, then migrated with the existing collision/warning behavior to the nearest supported media action: current-only -> mixed, Blue-range video -> video-only, and legacy Cyan audio -> audio-only. Legacy targets collapse onto the single visible Export-to-AE card, and after load no retired target or action reference remains. The migration intentionally adopts current automatic Blue-range/fallback semantics rather than preserving removed explicit-range or current-only modes.

## Persistent protocol

One canonical managed interpreter runs with `-I -u -X faulthandler`, `shell: false`, hidden pipes, the isolated Runtime environment, and one worker-lifetime temporary directory.

- Startup emits one strict versioned READY envelope.
- Background preparation sends a distinct `prepare` request that validates containment, loads runner/entry dependencies and platform identity, and never calls feature `execute()`, `scriptapp()`, project, timeline, config, or AE launch.
- Each business request is one bounded UTF-8 JSON line with a positive monotonic request id, operation, contained script root/entry, Command id, and config snapshot.
- Each response is one bounded UTF-8 JSON line containing the same Runtime/script envelope already consumed by `RuntimeManager`.
- The response envelope supports the existing one-shot 1 MiB output class so a valid AE JSX plan up to the host's 768 KiB limit is not rejected.
- Stdout is protocol-only. Bounded request-local stderr is retained only for controlled process diagnostics and native-crash classification.

The parent owns one active request and an explicit bounded FIFO. The 10-second command deadline starts when the request is written, not while it waits. Queue overflow fails before sending and does not disturb active work.

## State and health

Every business request creates a fresh ScriptContext and reacquires Resolve, the current project, and the current timeline. Imported modules may remain warm; configuration, Resolve objects, project/timeline state, clips, JSX, logs, and results never persist between requests.

Worker health is keyed to canonical interpreter identity/mtime, live Resolve version, and canonical bridge module/library identity. A changed key replaces the idle worker before dispatch. A prepared worker initially carries only interpreter identity and adopts the full health key after the ordinary live Probe confirms it.

Timeout, protocol violation, malformed output, output overflow, native crash, stdin/stdout failure, EOF, or child exit kills the worker once, waits for close and temporary-directory cleanup, rejects active and already queued work, and never retries the failed command. Only a later new command starts one replacement.

An actual `ResolveAdapterError` script envelope is preserved but settled only after the worker has closed, cleaned up, rejected overlapping queued work, and cleared its session. The immediately later command therefore cannot enter a dying fusionscript process.

## Relationship to the PowerShell helper

The PowerShell helper owns fresh AE process enumeration and its `QUERY <id>` protocol. The Python worker owns managed Runtime business execution and JSON envelopes. Their processes, state machines, errors, environments, timers, prewarm behavior, validation, and tests remain separate.

The adoption may export narrow pure helpers from the existing Runtime launcher, especially Windows native-Python crash classification. A stateless bounded UTF-8 line helper is optional only if it leaves both callers simpler. No stateful `ChildPipeSession`, cross-process protocol adapter, or new generic supervisor is introduced.

## Host lifecycle

`createClacklyCore()` owns the Python worker and exposes only narrow preparation and disposal functions. Workflow Integration and standalone schedule preparation in a microtask after Electron readiness without awaiting it, beside but independent of PowerShell prewarm. Both dispose both children during `will-quit`.

Preparation failure is contained. A later first export may create a fresh worker, but a request already sent is never retried. Normal Resolve quit triggers Workflow host quit and disposal, so no worker is expected to survive a normal Resolve restart.

## Packaging and specifications

The managed Runtime staging and package verifier include `persistent_bootstrap.py` in the exact inventory outside asar. Package qualification records source, staged, packaged, and installed identity. No machine Python, PATH fallback, ambient site, or desktop environment is introduced.

Backend specs are updated as part of adoption: the one-process-per-execution rule is scoped to `RuntimeLauncher` and Probe, while a new permanent Export-to-AE persistent-worker scenario records signatures, protocol, FIFO, timeout, replacement, health, prewarm, packaging, validation, and test contracts.

## Acceptance and rollout

Automated qualification recreates the full A/B protocol, failure, parity, memory, and lifecycle suite for the three supported actions, including playhead and Blue-range fixtures plus legacy-binding migration. The installed Workflow then records one labeled first-use export, at least three steady default exports, one audio export, and a representative AE composition inspection. Steady default median must remain at most 200 ms and materially below the corrected 464.559 ms A baseline. The first-use observation must show that any outer delay is not caused by a failed Python preparation.

Installed qualification also reruns real managed-worker timeout and `ResolveAdapterError` replacement, checks bounded process/memory behavior over repeated requests, and confirms both Python and PowerShell exit with the host.

Rollback is one routing seam: default Export-to-AE business execution back to the one-shot launcher, remove the persistent worker/Bootstrap and host lifecycle additions, restore package inventory/spec wording, rebuild, and reinstall. The Resolve2AE core remains unchanged and hash-qualified; the entry policy map changes only to remove the three retired ids.
