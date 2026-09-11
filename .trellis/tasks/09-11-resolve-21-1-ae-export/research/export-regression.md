# Research: Resolve 21.1 Export-to-AE regression

- Query: Trace the shipped Export-to-After-Effects path end to end, identify the confirmed failing stage after the Resolve 21.1 upgrade, separate evidence from hypotheses, and record the smallest repair/diagnostic scope.
- Scope: mixed (repository, live read-only Resolve/AE diagnostics, prior task evidence)
- Date: 2026-09-11 (Asia/Shanghai)

## Executive finding

The strongest code-backed failure is before the Python feature, Resolve timeline selection, OTIO, or After Effects: the only shipped managed-runtime profile is pinned to Resolve 20.3.2, while the live Resolve MCP reports 21.1.0.14. `RuntimeResolver` requires a host-version-prefix match and returns `RUNTIME_UNSUPPORTED` for 21.1.0.14; `PythonProvider` maps that to “No compatible managed Python runtime for this Resolve version,” and `RuntimeManager.execute()` resolves/probes before spawning the export script. This is the confirmed failure stage for the current source/package when no executable override is present, not a claim that the user's exact historical invocation has been reproduced.

No incident-specific Export-to-AE log or current Clackly host was found locally. The existing probe cache, legacy logs, and WER events are mostly 20.3.2-era or unrelated Resolve hangs; a real 21.1 package/selection/AE execution still needs a controlled manual reproduction after the runtime compatibility gate is repaired.

## Evidence collected

### Live host and timeline (read-only)

- Resolve MCP reports `21.1.0.14`; AE MCP reports `26.3x87` (facts recorded in the task PRD). A live `run_script` call verified Resolve `21.1.0.14`, current timeline, and `Timeline.GetSelectedClips()` as a Python `list` with count `0`.
- A second read-only timeline snapshot reported: `GetStartFrame() = 86400`, `GetEndFrame() = 106661`, `GetCurrentTimecode() = 01:07:26:04`, 24 fps, 1920x1080, no markers, three enabled video tracks (13, 6, 0 items), three enabled audio tracks (12, 3, 0 items), and zero selected clips. The playhead-derived frame 97108 overlaps one video and one linked audio item. Nothing in this query changed Resolve or the open project.
- Resolve process inventory at collection time contained `Resolve.exe`, two `ResolveMCP.exe`/`ResolvePython.exe` pairs, and `AfterFX.exe`; no Clackly/Electron process was running. This means the MCP host is not evidence that the Clackly Workflow host had attempted an export.
- `CLACKLY_PYTHON_EXECUTABLE` was empty at process, user, and machine scopes. This removes the explicit override branch for this machine, but does not prove the user's affected machine has no override.

### Managed-runtime mismatch (confirmed source behavior)

1. `resolve-command-center/resources/runtimes/manifest.json:5-20` declares the sole profile `python-cpython-3.13.14-resolve-20.3.2-win32-x64` with `host.versionPrefix = "20.3.2"`; `resources/runtimes/python-win32-x64.lock.json:1-8` repeats that identity. The release and build-staging manifests contain the same single profile.
2. `resolve-command-center/script-runtime/runtime/resolver.js:30-35` only accepts a host version when every prefix component matches. Its filtering and failure are at `:95-121`; no match raises `RuntimeError` code `RUNTIME_UNSUPPORTED` with the requested host version in `details`.
3. A read-only Node invocation of the current resolver against host `21.1.0.14` returned:

   ```text
   code=RUNTIME_UNSUPPORTED
   message=No compatible managed runtime profile
   details.host.version=21.1.0.14
   ```

   The same invocation against `20.3.2.9` found the 20.3.2 profile (the source tree does not contain the packaged executable, so that source-only invocation then reported `RUNTIME_NOT_FOUND`; the release package does contain the managed executable).
4. `resolve-command-center/script-runtime/runtime/manager.js:114-143` identifies the persistent AE path but always calls `resolveAndProbe()` first. `:274-325` obtains the host version, resolves the profile, and probes before any `script-execute` request can start.
5. `resolve-command-center/script-runtime/providers/PythonProvider.js:22-29` maps `RUNTIME_UNSUPPORTED` to status `unavailable` and message `No compatible managed Python runtime for this Resolve version`; `:148-158` returns that result from Feature Status refresh. Direct execution wraps the same error at `:96-115`.
6. `resolve-command-center/command-engine/executor.js:23-45` gates only command existence, enablement, and required config before calling the Capability. Therefore a stale/ready Feature Status does not hide the execute-time resolver failure; `RuntimeManager` rechecks it.

This is a pre-script failure. It cannot yet be blamed on `GetSelectedClips`, marker extraction, OTIO, JSX, AE launch, or AE import because none of those stages are reached in the unsupported-profile path.

### Local cache/log/WER state (not incident proof)

- **Path verification (2026-09-11):** the directories were checked independently with `Join-Path`, not as one concatenated path: `C:\\Users\\Administrator\\AppData\\Roaming\\clackly` exists and contains `runtime-probe.json`, `runtime-probe-live-20260804.json`, `clackly.log`, and `bridge.log`; `C:\\Users\\Administrator\\AppData\\Local\\CrashDumps` exists and contains only explorer/GenP/mpv/SearchHost dumps; `C:\\Users\\Administrator\\AppData\\Local\\clackly` is absent. This corrects an earlier diagnostic transcript where a multi-path array was rendered as one header; the absence claim below is based on the separate checks.
- **WER detail (2026-09-11 read-only query):** Application event 1002 and Windows Error Reporting event 1001 identify Resolve.exe 21.1.0.14 `AppHangB1` on 2026-09-08 and 2026-09-10 (plus `AppHangTransient` on 2026-09-08). These records identify host hangs only; they do not name Clackly, Python, fusionscript, or an Export-to-AE invocation.

- `%APPDATA%\\Clackly\\runtime-probe.json` is a successful cache for Clackly 0.1.0, CPython 3.13.14 profile `...resolve-20.3.2...`, Resolve 20.3.2.9, and a development-release executable path (`D:\Clackly\\resolve-command-center\\release\\...\\python.exe`). It has no 21.1 result and is not a valid explanation for bypassing the 21.1 resolver match because the fingerprint includes `resolveVersion`.
- `%APPDATA%\\Clackly\\clackly.log` and `bridge.log` end in July 2026. They describe the legacy standalone bridge, missing environment-variable warnings, health checks, and several HTTP 400 marker/media requests; they contain no 21.1 Export-to-AE attempt. `bridge/resolve_bridge.py:20-27` confirms this bridge only handles `timeline.addMarker` and Clipboard Image commands, not `ae.export`.
- `%LOCALAPPDATA%\\CrashDumps` has no Python, Resolve, Clackly, or AfterFX dump. Read-only Application/WER queries found Resolve `AppHangTransient`/`AppHangB1` records for 21.1.0.14 on 2026-09-08/10, but no Python/fusionscript/Clackly export crash record. Temporal association with Export-to-AE is absent.
- The diagnostic sampler already has the correct evidence path: `resolve-command-center/scripts/diagnostic-sampler/Collect-ClacklyDiagnostics.ps1:323-377` observes relevant processes without terminating them, `:380-415` copies bounded legacy logs and Application Error/WER 1000/1001 events, and `:463-521` quarantines/restores the probe cache while recording before/after state. Its README explicitly says it does not collect Resolve/AE projects or media (`scripts/diagnostic-sampler/README.txt:4-9`) and asks for one Resolve → Clackly → AE reproduction (`:11-18`).

## Complete current invocation and status path

| Stage | Evidence and contract |
| --- | --- |
| Command invocation | Visible `timeline.exportToAfterEffects` plus internal audio/video commands are declared in `resolve-command-center/command-engine/commands/after-effects.json:3-32`; all target Capability `ae.export`. Palette direct execution calls `commands:execute` in `electron/main/main.js:139-146` or `workflow-plugin/main.js:223-230`. Mouse bindings are loaded/matched by `interaction/BindingStorage.js:22-86` and `interaction/InteractionManager.js:38-55`; the host then calls the same Command executor. |
| Host wrapper | Standalone `executeStandaloneCommand()` delegates to `core.executeCommand()` and only rewrites a known Resolve-unavailable message (`electron/main/main.js:72-89`). Workflow `executeWorkflowCommand()` delegates and adds `{ok:true, command, ...result}` (`workflow-plugin/main.js:156-167`). Neither host extracts timeline selection. |
| Command/config gate | `command-engine/executor.js:23-45` looks up the command, gets `ae.export`, checks enabled/configured state, builds scoped config, records usage, and invokes the Capability. It has no Resolve/AE branch. |
| Capability/runtime composition | `capability/definitions/ae-export.json:1-34` selects Python entry `scripts/resolve2ae_export.py` and requires `aePath`; `capability/registerScripts.js:23-30` wires `ScriptCapabilityProvider -> ScriptExecutor -> PythonProvider -> RuntimeManager`. `ScriptCapabilityProvider.js:19-40` forwards only Command id, Capability id, config snapshot, and logger. |
| Runtime readiness/execute | `PythonProvider.js:133-159` uses the same RuntimeManager Probe for Feature Status. `runtime/manager.js:95-143` validates the request, recognizes the three Export-to-AE command ids for the persistent worker, resolves/probes Resolve/Python, and only then sends `script-execute`; `:274-325` owns the host-version/profile/probe pipeline. Unsupported 21.1 stops here. |
| Python context | `script-runtime/python_runner.py:39-69` creates a lazy, per-request context. `context.resolve` calls `resolve.adapter.get_resolve()` and `context.project`/`timeline` calls `get_project_and_timeline()` once. This subprocess is the managed export path, not the legacy HTTP bridge. |
| Wrapper policy | `scripts/resolve2ae_export.py:6-36` maps the three current ids to `(mode, target_policy, media_policy)`, validates `aePath`, adapts the optional preview flag, and calls `process_and_send()`. A controlled `{ok:false}` result is converted to `RuntimeError` at `:37-38`; an unsupported Command id is rejected before Resolve access at `:15-17`. |
| Resolve/range/clip selection | `resolve2ae_core/export.py:151-312` currently reads timeline FPS/start/markers, resolves the Blue duration range through `resolve/timeline_range.py`, otherwise converts the playhead to a one-frame interval, filters enabled tracks/clips, applies media policy and linked-audio de-duplication, and returns target records. `resolve/adapter.py:158-172,391-396` owns current project/timeline and raw start/marker calls. |
| OTIO/JSX result | `process_and_send()` reports `Analyzing...`, target/no-clip outcomes, then OTIO `Exporting OTIO...`/`Parsing Data...` at `resolve2ae_core/export.py:538-605`; it builds JSX and returns seven public result keys plus private `__clacklyDesktopLaunch` at `:1057-1067`. |
| AE launch/status | `runtime/manager.js:142-197` strips the private launch directive, delegates it to `AfterEffectsLauncher`, and appends `Sending...`/`Starting AE...` plus a success message. `capability/afterEffectsLaunch.js:191-232` validates the configured executable/JSX, sends `AfterFX.exe -r <jsx>` if running, or creates a bootstrap for a cold launch. Python logger messages are replayed by `PythonProvider.js:117-130`; launch failures become typed RuntimeErrors and propagate to the host/renderer. |

## Current selection/range contract that must not drift

- Marker range extraction is already factored into `resolve-command-center/resolve/timeline_range.py:1-74`: frozen `TimelineRange(start_frame, end_frame_exclusive, source="resolve-duration-marker")`, exact integer/increasing invariants, Blue `duration > 1`, lowest numeric frame, one timeline-start offset, and `86400` fallback when start is `None`. `TimelineRangeScanError` preserves the existing auto-vs-explicit error boundary.
- The active backend spec records the public contract at `.trellis/spec/backend/quality-guidelines.md:555-627`: product triples are exactly auto/mixed, audio-only, and video-only; `auto` prefers a Blue duration marker then playhead; marker intervals are half-open membership only; selected clips are not trimmed; mixed de-duplicates linked audio; OTIO runs whenever any video record exists; Core success has a private desktop-launch directive while public Runtime output strips it.
- Archived evidence confirms the exact range flow and gaps (`.trellis/tasks/archive/2026-08/08-09-timeline-range-contract/research/export-to-ae-range-flow.md:12-25,31-47,61-95`). Do not duplicate or move that marker resolver while planning native selection.

## Failure classification

| Classification | Evidence | Confidence / missing proof |
| --- | --- | --- |
| **Confirmed current pre-script blocker** | Sole manifest profile is 20.3.2; live host is 21.1.0.14; direct Resolver call returns `RUNTIME_UNSUPPORTED`; RuntimeManager resolves before Python/AE. | High for the current package with no override. Affected-machine package identity and host log still need capture. |
| **Possible follow-on native bridge incompatibility** | Resolve 21.1 MCP docs say 21.1+ ships custom Python 3.14; current Clackly profile is CPython 3.13.14. An unqualified 3.13 + 21.1 bridge could be ABI-incompatible. | Hypothesis only. Do not run known-crash native probes; qualify a compatible runtime in an isolated child and retain WER evidence first. Prior 09-02 research only reproduced old 20.3.2/system-Python 3.11/3.12 crashes (`.trellis/tasks/09-02-fix-packaged-ae-export-status/research/native-bridge-crash-isolation.md:9-35,51-86`). |
| **Possible selection/marker behavior regression** | `GetSelectedClips()` exists in 21.1 and current live selection is empty; current export still uses marker/playhead policies. | Hypothesis only. No non-empty selection was reproduced and no Clackly host ran the command. |
| **Possible OTIO/JSX/AE failure** | Existing code reaches OTIO/JSX/AE only after target selection. Prior 20.3.2 qualification reports warm/cold AE sends; current local logs have no 21.1 attempt. | Hypothesis only; requires a successful runtime gate and one controlled export. |
| **Resolve host hang** | WER has Resolve 21.1 AppHang events on 2026-09-08/10. | Unrelated until a sampler correlates a single export window; no Clackly/Python/AE fault evidence exists. |

## Prior evidence to reuse (do not repeat)

- `.trellis/tasks/09-02-fix-packaged-ae-export-status/research/packaged-python-selection.md:21-49` already establishes that the default product path is an absolute packaged executable, an explicit override is the only alternate, and a stale cross-location cache can obscure the selected path. It does not cover a 21.1 profile.
- `.trellis/tasks/09-02-fix-packaged-ae-export-status/research/native-bridge-crash-isolation.md:9-35,51-86,97-189` isolates the older `RUNTIME_NATIVE_BRIDGE_CRASH` boundary and states that the current UI drops process/WER details. It specifically says no current packaged-runtime crash/WER evidence was available.
- `.trellis/tasks/09-04-add-diagnostic-sampler/research/diagnostic-sampler-plan.md:9-20,25-47,77-83` and the shipped sampler files define the safe one-shot cache/process/log/WER evidence path. Use that tool for the affected machine rather than probing the native bridge in-process or modifying open projects.

## Minimum repair / migration scope

1. **Runtime compatibility first (required):** choose and qualify a Resolve 21.1-compatible runtime, add a versioned profile (or deliberately drop 20.3 support), update lock/package identity and cache invalidation, and run the managed `resolve-probe` plus one Workflow package check. Do not loosen `matchesVersion()` or guess that CPython 3.13.14 works with a 21.1 bridge; the ADR explicitly rejects version guessing (`resolve-command-center/docs/ADR-managed-python-runtime.md:27-41`).
2. **Native selection second (separate implementation):** keep the existing Command/Capability/runtime boundaries. Add a selection-first branch in the Python export core using the existing `context.timeline`; do not route selection through the legacy standalone HTTP bridge or widen `ScriptContext` unless a reviewed design proves it necessary. The companion `native-selection-plan.md` records the exact policy proposal and decisions.
3. **Incident evidence if still failing:** run the shipped sampler once on a cleanly restarted, known package. Capture package hashes, all override scopes, process command lines, probe before/after, WER events, and one export window. Do not save/reset the dirty AE project or invoke unsafe native probes.

## Acceptance checks for this diagnosis

- Runtime resolver unit/integration check: host `20.3.2.9` selects the existing profile; host `21.1.0.14` selects the newly qualified profile (or returns a deliberate, documented unsupported status if 21.1 is not shipped). No unqualified prefix bypass.
- Feature Status refresh for configured `ae.export` reports `ready` only after a fresh 21.1 Probe; unsupported/missing profile remains a stable unavailable status with no script/AE side effects.
- Direct `executeCommand` with a valid `aePath` reaches Python only after the 21.1 resolver/probe; capture `Analyzing...`, selection result, OTIO/JSX, and AE launcher status separately.
- If runtime still fails, the sampler evidence must identify executable/profile, bridge module/library, process exit or WER, and whether the failure occurred before script execution.

## Caveats / Not Found

- No affected-machine Clackly version/package hash or current export invocation was available. The runtime mismatch is proven for the current repository/release artifacts, not for an unknown older/newer installed build.
- No non-empty native selection can be created through the Resolve scripting API without UI interaction; `search_scripting_api` found `Timeline.GetSelectedClips()` but no timeline-selection setter (only Media Pool `SetSelectedClip`).
- AE MCP responsiveness and a running `AfterFX.exe` do not prove an AE import occurred; the Runtime Manager may never reach the desktop launcher.
- This research made no product, test, package, project, save, render, export, or git changes. Only the two files under this task's `research/` directory are to be delivered.
