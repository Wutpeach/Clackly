# Research: TimelineRange extraction boundary evidence

- Query: Which current Clackly abstraction should own Resolve fact acquisition, Timeline Range resolution, and Export-to-AE consumption, and what is the smallest compatible extraction boundary?
- Scope: internal
- Date: 2026-08-09

## Findings

### Files found

- `resolve-command-center/command-engine/executor.js` — resolves a Command to one registered Capability and passes only scoped configuration.
- `resolve-command-center/capability/registry.js` — executable Feature registry and metadata validator.
- `resolve-command-center/feature-status/FeatureStatusManager.js` — installed/enabled/readiness cache, not action-time domain state.
- `resolve-command-center/app/createClacklyCore.js` — shared Composition Root for the two Electron hosts.
- `resolve-command-center/capability/registerScripts.js` — discovers script Capabilities and wires the runtime provider chain.
- `resolve-command-center/script-runtime/ScriptCapabilityProvider.js` — narrows Command/config data before runtime execution.
- `resolve-command-center/script-runtime/ScriptExecutor.js` — dispatches only on runtime name.
- `resolve-command-center/script-runtime/providers/PythonProvider.js` — validates the entry and transports JSON through RuntimeManager.
- `resolve-command-center/script-runtime/python_runner.py` — owns the exact Python `ScriptContext` API and lazy Resolve/project/timeline access.
- `resolve-command-center/resolve/adapter.py` — Python-owned Resolve connection, project/timeline lookup, frame conversion, and adapter errors.
- `resolve-command-center/resolve/adapter.js` — Workflow Integration adapter for the handwritten marker Capability; not used by the managed Python export.
- `resolve-command-center/scripts/resolve2ae_export.py` — AE Feature entry and Command-to-export-policy mapping.
- `resolve-command-center/resolve2ae_core/export.py` — currently combines marker acquisition/resolution, clip selection, and AE export.
- `resolve-command-center/resolve2ae_core/tests/test_export_core.py` — current range-selection and error compatibility evidence.

### Current ownership and call path

The active path is:

`Command Engine -> ae.export Capability -> ScriptCapabilityProvider -> ScriptExecutor -> PythonProvider/RuntimeManager -> python_runner ScriptContext -> resolve2ae_export.execute -> resolve2ae_core.process_and_send -> get_target_clips_logic -> Resolve timeline APIs`.

- Command Engine is intentionally a router: it looks up `command.capability`, checks enablement/configuration, and calls `capability.execute(command, { config })`; it has no Resolve or selection logic (`resolve-command-center/command-engine/executor.js:22`, `resolve-command-center/command-engine/executor.js:28`, `resolve-command-center/command-engine/executor.js:33`).
- `ae.export` is metadata selecting the Python entry, not a range provider (`resolve-command-center/capability/definitions/ae-export.json:2`, `resolve-command-center/capability/definitions/ae-export.json:10`). Script registration converts that metadata into an ordinary Capability and uses the shared Registry (`resolve-command-center/capability/registerScripts.js:23`, `resolve-command-center/capability/registerScripts.js:29`, `resolve-command-center/capability/registerScripts.js:40`).
- `ScriptCapabilityProvider` deliberately forwards only Command id, Capability id, a defensive config snapshot, and logger (`resolve-command-center/script-runtime/ScriptCapabilityProvider.js:19`, `resolve-command-center/script-runtime/ScriptCapabilityProvider.js:30`, `resolve-command-center/script-runtime/ScriptCapabilityProvider.js:35`). `ScriptExecutor` selects only by `scriptDefinition.runtime` (`resolve-command-center/script-runtime/ScriptExecutor.js:6`, `resolve-command-center/script-runtime/ScriptExecutor.js:13`). Neither has domain inputs from which a TimelineRange could be resolved.
- Each Python execution builds a lazy `ScriptContext`; Resolve, project, and timeline are acquired only on property access and cached for that execution (`resolve-command-center/script-runtime/python_runner.py:39`, `resolve-command-center/script-runtime/python_runner.py:52`, `resolve-command-center/script-runtime/python_runner.py:58`). Tests lock the public context to exactly `command_id`, `config`, `logger`, `project`, `resolve`, and `timeline`, and lock lazy/cached acquisition (`resolve-command-center/script-runtime/test_python_runner.py:35`, `resolve-command-center/script-runtime/test_python_runner.py:65`, `resolve-command-center/script-runtime/test_python_runner.py:74`).
- The Feature entry maps stable Command ids to AE-specific mode/target/media policies, validates AE config, and delegates to the core (`resolve-command-center/scripts/resolve2ae_export.py:6`, `resolve-command-center/scripts/resolve2ae_export.py:16`, `resolve-command-center/scripts/resolve2ae_export.py:31`).
- The current coupling is inside `get_target_clips_logic`: it reads `GetStartFrame` and `GetMarkers`, resolves the earliest qualifying Blue duration marker, and immediately applies the resulting frames to AE clip overlap (`resolve-command-center/resolve2ae_core/export.py:149`, `resolve-command-center/resolve2ae_core/export.py:163`, `resolve-command-center/resolve2ae_core/export.py:166`, `resolve-command-center/resolve2ae_core/export.py:197`, `resolve-command-center/resolve2ae_core/export.py:213`).

### Evidence-backed ownership decision

1. **Resolve fact acquisition: Python Resolve adapter.** `resolve/adapter.py` already owns the managed-runtime connection and current project/timeline lookup (`resolve-command-center/resolve/adapter.py:41`, `resolve-command-center/resolve/adapter.py:148`), and `ScriptContext` explicitly delegates lazy Resolve services to it (`resolve-command-center/script-runtime/python_runner.py:53`, `resolve-command-center/script-runtime/python_runner.py:58`). R2 should add only narrow action-time accessors for the two required facts: timeline start frame and raw timeline markers. Marker-read exceptions must remain distinguishable/unchanged; using the adapter's current exception-suppressing `_call_optional` would break explicit-range behavior (`resolve-command-center/resolve/adapter.py:31`).

2. **Range resolution and invariants: one small shared Python domain module adjacent to the Resolve adapter, proposed as `resolve/timeline_range.py`.** It should contain the `TimelineRange` value and one pure resolver taking acquired primitives (`timeline_start_frame`, `markers`). This removes Marker parsing from `resolve2ae_core` without creating a Registry, manager, provider family, store, or second Composition Root. Keeping acquisition accessors and the pure resolver separate is necessary because current fallback catches marker read/scan failures but does not wrap the earlier `GetStartFrame` call (`resolve-command-center/resolve2ae_core/export.py:163`, `resolve-command-center/resolve2ae_core/export.py:168`, `resolve-command-center/resolve2ae_core/export.py:179`).

3. **Export-to-AE consumption and fallback policy: remain in `resolve2ae_core/export.py`.** The Export feature should ask for an optional resolved range, use it for half-open overlap, and retain its own `auto` playhead fallback versus required `blue-range` behavior. Media policy, track enablement, linked-audio deduplication, clip selection, OTIO, JSX, and terminal results are AE business logic, not TimelineRange responsibilities (`resolve-command-center/resolve2ae_core/export.py:197`, `resolve-command-center/resolve2ae_core/export.py:530`, `resolve-command-center/resolve2ae_core/export.py:542`).

4. **Feature entry remains orchestration only.** `scripts/resolve2ae_export.py` should retain Command policy/config mapping and must not become the owner of marker parsing or domain validation (`resolve-command-center/scripts/resolve2ae_export.py:6`, `resolve-command-center/scripts/resolve2ae_export.py:22`).

### Minimal proposed contract

Semantic contract (representation may be a standard-library frozen Python dataclass; it does not need to cross JSON):

```text
TimelineRange
  start_frame: int
  end_frame_exclusive: int
  source: "resolve-blue-duration-marker"
```

- Coordinate system: **Resolve timeline-absolute frames**, matching `TimelineItem.GetStart()` / `GetEnd()`. Current conversion is `start = int(marker_frame) + timeline.GetStartFrame()` (`resolve-command-center/resolve2ae_core/export.py:183`, `resolve-command-center/resolve2ae_core/export.py:186`).
- End semantics: **exclusive**. Current end is `start + duration`, and overlap is `clip_start < end && clip_end > start` (`resolve-command-center/resolve2ae_core/export.py:187`, `resolve-command-center/resolve2ae_core/export.py:214`). Naming the field `end_frame_exclusive` makes the existing rule explicit.
- Source vocabulary: one closed value, `resolve-blue-duration-marker`; no speculative In/Out, selected-clip, multi-range, or generic source registry.
- Invariants: integer start/end, `end_frame_exclusive > start_frame`, and the one supported source. The TimelineRange constructor/factory is the single invariant owner. Source-specific qualification (`color == "Blue"`, coerced duration `> 1`, earliest numeric frame) belongs to the resolver (`resolve-command-center/resolve2ae_core/export.py:171`, `resolve-command-center/resolve2ae_core/export.py:177`, `resolve-command-center/resolve2ae_core/export.py:184`).
- Absence: the resolver returns `None` when no qualifying source exists. Export owns whether that means playhead fallback (`auto`) or the existing missing-marker terminal failure (`blue-range`). This avoids baking AE policy into the shared domain.
- No FPS field: marker range resolution is frame-based. FPS is independently read for playhead timecode and AE seconds conversion (`resolve-command-center/resolve2ae_core/export.py:154`, `resolve-command-center/resolve2ae_core/export.py:194`, `resolve-command-center/resolve2ae_core/export.py:619`).

### Boundaries that should not own TimelineRange

- **No new Command/Capability.** A TimelineRange is changing Resolve state queried during another Capability execution, not an executable user intent. Capability Registry requires an executable object plus Feature metadata/config (`resolve-command-center/capability/registry.js:25`, `resolve-command-center/capability/registry.js:30`, `resolve-command-center/capability/registry.js:34`). Registering a range Capability would incorrectly give this value Feature lifecycle/config semantics.
- **Not FeatureStatusManager.** It caches installed/enabled/readiness and calls parameterless availability probes (`resolve-command-center/feature-status/FeatureStatusManager.js:76`, `resolve-command-center/feature-status/FeatureStatusManager.js:104`, `resolve-command-center/feature-status/FeatureStatusManager.js:132`). A missing marker is a per-execution selection outcome, not Feature unavailability.
- **Not ScriptCapabilityProvider, ScriptExecutor, PythonProvider, or RuntimeManager.** These are generic runtime transport/dispatch layers; their request contains runtime, Capability id, entry, Command id, and JSON config only (`resolve-command-center/script-runtime/runtime/manager.js:81`, `resolve-command-center/script-runtime/runtime/manager.js:100`, `resolve-command-center/script-runtime/runtime/manager.js:110`). Adding Resolve selection here would affect every Python Feature and cross the JS/Python protocol unnecessarily.
- **Not the application Composition Root or hosts.** The Root constructs shared services but deliberately does not resolve host context eagerly (`resolve-command-center/app/createClacklyCore.js:18`, `resolve-command-center/app/createClacklyCore.js:62`, `resolve-command-center/app/createClacklyCore.js:75`). Workflow and standalone hosts provide only Resolve version/runtime readiness and marker-add adapters (`resolve-command-center/workflow-plugin/main.js:96`, `resolve-command-center/workflow-plugin/main.js:100`, `resolve-command-center/electron/main/main.js:25`, `resolve-command-center/electron/main/main.js:29`). The managed Python subprocess makes its own lazy Resolve connection, so host-side range acquisition would create a second path and stale/cross-process DTO.
- **Not the JavaScript Workflow adapter.** `resolve/adapter.js` supports the handwritten marker-add Capability (`resolve-command-center/resolve/adapter.js:89`, `resolve-command-center/resolve/adapter.js:136`); AE export runs through the managed Python adapter. Implementing the resolver in both languages would duplicate precedence and malformed-data semantics.
- **Do not widen ScriptContext in R2.** Its exact public shape is documented and tested (`resolve-command-center/README.md:154`, `resolve-command-center/script-runtime/test_python_runner.py:65`). The existing `context.timeline` already provides the action-time timeline object needed by the Python core. A `context.timeline_range` property would be a larger public API and runner change with no current second runtime consumer.

### Minimal R2 dependency shape

```text
Before:
  resolve2ae_core/export.py
    -> Resolve timeline GetStartFrame/GetMarkers
    -> marker parsing + precedence
    -> clip overlap + AE export

After:
  resolve/adapter.py
    -> acquire start-frame and marker facts at action time
  resolve/timeline_range.py
    -> pure facts-to-TimelineRange resolution + invariants
  resolve2ae_core/export.py
    -> optional TimelineRange -> existing overlap/fallback/export behavior
```

This is an extraction, not a framework: two adapter accessors, one value contract, one resolver, and replacement of the coupled block in `get_target_clips_logic`.

### Compatibility risks R2 must pin

- Preserve `GetStartFrame() is None -> 86400` exactly (`resolve-command-center/resolve2ae_core/export.py:163`). Do not reinterpret marker frames as absolute; marker keys are currently timeline-relative and are offset once.
- Preserve qualifying rule `color == "Blue"` and `int(duration) > 1`; point markers and Cyan are ignored (`resolve-command-center/resolve2ae_core/export.py:173`, `resolve-command-center/resolve2ae_core/export.py:177`).
- Preserve deterministic lowest **numeric** qualifying frame, independent of mapping insertion order; tests reverse marker order and still require frame 20 (`resolve-command-center/resolve2ae_core/tests/test_export_core.py:887`, `resolve-command-center/resolve2ae_core/tests/test_export_core.py:905`).
- Preserve malformed-entry behavior. Exceptions while reading `color`/coercing duration skip that entry, while a non-numeric qualifying frame key currently escapes the inner entry handler and therefore becomes an overall scan failure (`resolve-command-center/resolve2ae_core/export.py:171`, `resolve-command-center/resolve2ae_core/export.py:172`, `resolve-command-center/resolve2ae_core/export.py:178`). R2 must not silently make parsing more permissive.
- Preserve policy-specific failures: `auto` suppresses marker acquisition/scan failure and falls back to the playhead; explicit `blue-range` propagates marker API errors (`resolve-command-center/resolve2ae_core/export.py:179`, `resolve-command-center/resolve2ae_core/tests/test_export_core.py:994`).
- Preserve no-valid-range behavior and text: explicit range yields code `missing-marker` and message `No Blue duration marker found`; auto remains single mode (`resolve-command-center/resolve2ae_core/export.py:189`, `resolve-command-center/resolve2ae_core/export.py:573`, `resolve-command-center/resolve2ae_core/tests/test_export_core.py:967`). A renamed public error must not leak in R2.
- Preserve half-open overlap at both boundaries; do not change `GetEnd()` interpretation or include clips touching only at range start/end (`resolve-command-center/resolve2ae_core/export.py:209`, `resolve-command-center/resolve2ae_core/export.py:214`).
- Preserve Command policy mapping and returned result schema. The entry test checks every Command triple and exact delegation (`resolve-command-center/scripts/test_resolve2ae_export.py:27`, `resolve-command-center/scripts/test_resolve2ae_export.py:47`).
- Keep TimelineRange in-process. Python results must be JSON-serializable and the provider returns/replays only the script envelope (`resolve-command-center/script-runtime/python_runner.py:109`, `resolve-command-center/script-runtime/providers/PythonProvider.js:99`, `resolve-command-center/script-runtime/providers/PythonProvider.js:109`). Serializing TimelineRange into the public Feature result would create a new JS/Python contract unrelated to extraction.

### Type and error conventions

- Production JavaScript is CommonJS with constructor/factory boundary checks that throw `TypeError`; domain/controlled failures use `Error` subclasses carrying stable codes only where the boundary needs them (`resolve-command-center/capability/errors.js:1`, `resolve-command-center/script-runtime/runtime/errors.js:1`). There is no production TypeScript in this package.
- Python uses type hints selectively, small exception subclasses (`ResolveAdapterError(RuntimeError)`, `MissingMarkerError(ValueError)`), and plain dictionaries for JSON terminal contracts (`resolve-command-center/resolve/adapter.py:9`, `resolve-command-center/resolve2ae_core/export.py:145`, `resolve-command-center/resolve2ae_core/export.py:530`). No existing Python domain-value-object convention was found.
- Therefore a standard-library frozen value object is the smallest way to centralize invariants without a dependency, but its representation should remain Python-internal. Preserve `MissingMarkerError` compatibility (either retain it in `export.py` or re-export the same class) because the Export layer, not the shared range domain, owns the user-facing missing-source policy.

## External references

None. Repository code, tests, README, and Trellis specs are sufficient; no third-party contract or version determines this boundary.

## Related specs

- `.trellis/spec/backend/quality-guidelines.md:124` — script executor/provider/runtime signatures.
- `.trellis/spec/backend/quality-guidelines.md:138` — Capability-to-runtime delegation boundary.
- `.trellis/spec/backend/quality-guidelines.md:141` — startup/readiness must not execute the Feature action.
- `.trellis/spec/backend/quality-guidelines.md:143` — ScriptCapabilityProvider forwards only stable Command id and scoped config.
- `.trellis/spec/backend/quality-guidelines.md:146` — lazy Resolve/project/timeline services are owned by `resolve.adapter.py`.
- `.trellis/spec/backend/quality-guidelines.md:169` — Resolve scripts consume `context.project` and `context.timeline`.
- `.trellis/spec/guides/code-reuse-thinking-guide.md` — shared decoding/normalization should have one owner rather than repeated untyped payload reads.

## Caveats / Not Found

- No other production consumer of Blue duration-marker range resolution was found. Marker-add reads markers only to diagnose a duplicate, and legacy binding/Command names route to the same AE Feature; there is no existing shared Range model, manager, provider, store, or serialized DTO.
- Repository tests do not establish behavior for a non-integer/non-numeric `GetStartFrame()` value, negative marker keys, integer overflow, or a range extending beyond timeline end. R2 should not add clamping or normalization for these unproven cases.
- The proposed source token `resolve-blue-duration-marker` is new vocabulary required by the requested contract; no existing source enum exists to reuse.
- No blocking architecture decision was found. The only implementation judgment is the internal Python value representation; it does not alter the ownership/dependency boundary above.
