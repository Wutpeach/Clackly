# Design: Resolve 21.1 AE Export

## Architecture
Keep Command -> Capability -> PythonProvider -> RuntimeManager -> export core -> OTIO/JSX -> desktop launcher. Preserve three command IDs and public results/status. Use one task with ordered stages: Runtime restoration and native selection produce one user-testable delivery; cleanup depends on user test success. No extra task hierarchy is needed.

## Runtime
Preserve the current qualified 20.3.2 profile. Inspect current 21.1 vendor bridge/interpreter requirements and qualify the smallest working runtime using existing isolated managed Probe infrastructure. MCP's interpreter is not proof of compatibility with Clackly's external bridge. Record executable/module/library/host identities; avoid known-incompatible probes and repeated crash retries.
Add only the verified profile, integrity/lock records and required existing staging/package changes. Do not overwrite old artifacts under their previous identity or loosen resolver matching. Existing fingerprint fields should invalidate old host/runtime cache; add fields only if actual identity evidence is missing. Confirm staged and packaged identity through existing verification.
If the external execution model cannot work without changing transport, report a design gate rather than silently introducing MCP as a product dependency. Do not assume a vendor-custom interpreter can be redistributed.

## Target Acquisition
For each existing command, keep its mixed/audio/video policy. Change the auto target path in resolve2ae_core/export.py:
1. On a native-selection host, read Timeline.GetSelectedClips once and map items into the existing target-record shape using actual track identity.
2. Non-empty selection is authoritative. Reuse enabled-track/clip, media and linked-media handling; preserve existing layer ordering, not arbitrary API enumeration order. Do not expand to enclosing-range membership.
3. Empty selection goes directly to existing playhead targeting, bypassing Markers. Non-empty selection filtered to nothing returns existing controlled no-clips behavior.
4. API absence on an already-qualified older host retains its legacy path in stage A and playhead only after stage B. An API exception or malformed response remains an explicit diagnostic failure, not an inferred empty selection.
5. Preserve full clip extents, absolute frame calculations and relative placement. Existing composition min/max span preserves gaps without collecting gap items. Preserve existing embedded-audio behavior; do not infer new unselected timeline items or redesign audio interpretation.
Reuse existing helpers/records, without a generic selection framework or duplicate exporter.

## Marker Lifecycle
Stage A retains legacy Marker implementation for comparison/rollback and existing compatibility calls. Native auto targeting never uses it, including for empty selection. No new visible command or permanent switch.
Stage B starts only on explicit user manual-test success. Audit all callers using fff; remove Marker-export policies/branches/errors, exclusive uncalled helpers, obsolete compatibility tests and active documentation claims. Preserve shared Marker APIs with non-export callers, three commands/bindings, playhead targeting and historical research. Use version control for rollback after deletion.

## Risks and Validation
The pre-script blocker may hide downstream bridge/OTIO/AE defects. Qualify Runtime before actual export. Verify non-empty real selection and its persistence when invoking Clackly, linked A/V, multitrack/disjoint ordering, media-filtered empty results and empty-selection/playhead behavior in all three modes. Use disposable project context; do not reset/save the user's dirty projects. Automated evidence does not replace the user's requested manual gate.

## Rollback
Keep stages reviewable separately. Preserve prior qualified runtime and unrelated edits; revert only task-owned changes if validation fails. Stage A retained code is temporary rollback support; stage B does not keep disabled legacy code.
