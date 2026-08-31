# AE export runtime, naming, organization, and activation implementation plan

## Ordered implementation

1. Repair the package prerequisite in `resolve-command-center/package.json` so
   Windows packaging always runs managed-runtime staging before Electron
   Builder.
2. Strengthen `scripts/stage-managed-python.test.js` and
   `scripts/verify-package.js` (plus its tests if split) so freshness is checked
   against current repository source as well as staging/package inventory.
   Preserve the existing managed-runtime manifest and package layout.
3. Add the smallest configuration-layer migration that silently removes only
   legacy `ae.export.prefix` before normal schema validation, preserving sibling
   and unrelated settings without weakening global unknown-key rejection.
4. Remove `prefix` from `capability/definitions/ae-export.json`, update exact
   schema/localization/catalog and migration tests, and confirm Settings remains
   generic. Stop reading/forwarding Prefix in `scripts/resolve2ae_export.py`.
5. In `resolve2ae_core/export.py`, move source naming into same-request JSX and
   add one project-item pass that discovers the fixed Source folder and the
   current timeline's maximum Clackly sequence. Encode the timeline-name JSX
   literal safely.
6. Create Source under the exact
   `[sourceWidthxsourceHeight]-TimelineName-N` contract while preserving all
   existing source dimensions, timing, layers, effects, and transforms.
7. Keep Preview disabled as one Source at root. When enabled, reuse/create
   `Clackly Source Comps`, move Source into it, create the root Preview as
   `[1920x1080]-TimelineName-N-Preview`, and preserve the existing centered
   uniform Fit and source-derived timing.
8. Make final Viewer selection conditional (Source when off, Preview when on),
   then emit one AE activation action. Do not edit command manifests,
   TimelineRange, Resolve adapters, RuntimeManager, persistent bootstrap, or
   `AfterEffectsLauncher` for this behavior.
9. Extend export-core tests for exact names, independent timeline counters,
   resolution continuity, gaps, 1080p Source collision avoidance, one-pass scan,
   folder move/reuse/create/root placement, final Viewer selection, activation
   order, and unchanged Fit/timing/content semantics.
10. Run focused and full automated gates. Inspect the diff for forbidden
    ownership changes and confirm current-source/staging/package hashes or
    markers agree.
11. Stage the managed runtime, build/package Windows, verify the package, and
    install the Workflow package before user testing.
12. Run real local-project-only Resolve/AE smoke with Preview off/on and
    ordinary, audio-only, video-only, and Blue/range interaction paths across
    warm AE; also run one cold-AE case. Verify foreground activation, Viewer
    target, sequence behavior, folder reuse after movement, and installed
    Preview creation. Stop at the architecture gate if AE-side activation is
    not reliable.

## Automated validation

Run from `resolve-command-center/` unless noted:

```powershell
$env:PYTHONPATH = (Join-Path $PWD 'scripts')
python -m unittest scripts.test_resolve2ae_export resolve2ae_core.tests.test_export_core
node --test script-runtime/integration.test.js scripts/stage-managed-python.test.js capability/afterEffectsLaunch.test.js script-runtime/runtime-manager.test.js
npm test
npm run runtime:stage
npm run build
npm run package:win
npm run package:verify
npm run workflow:install:package
git diff --check
```

Before real smoke, compare current source, staged runtime, packaged runtime,
and installed runtime identity and record the evidence.

## Review gates

- Planning gate: do not run `task.py start` or edit product code until the user
  explicitly approves the latest PRD/design/implementation summary.
- Runtime gate: package verification must fail for stale staging and pass only
  when current source is actually packaged.
- Naming gate: all sequence cases use current AE project state and one scan;
  no counter is stored outside AE.
- Architecture gate: no composition/focus policy enters Renderer, commands,
  Resolve adapters, RuntimeManager, the persistent worker, or host launcher.
- Foreground gate: automated JSX assertions are insufficient; warm/cold real
  AE activation must pass or the conflict is returned.
- Installation gate: install the verified Workflow package before asking the
  user to restart Resolve and retest.

## Risk and rollback points

- Keep package prerequisite/freshness changes separable from JSX behavior so a
  packaging regression can be isolated without restoring stale artifacts.
- Do not update disabled-path snapshots just to accept unintended source
  content/timing changes; only the explicitly approved naming and final Viewer/
  activation statements may change.
- If one-pass matching is ambiguous for timeline names containing punctuation,
  fix exact literal/matcher encoding locally and add fixtures rather than
  introducing a project-wide naming framework.
- If duplicate fixed-name folders exist, reuse the first project-order match as
  designed; do not silently merge/move user folders.
- If real `app.activate()` validation fails, revert the activation candidate and
  report the required cross-boundary change instead of adding hidden Win32
  behavior.

## Validation record — 2026-08-31

- Lead-reviewed the complete product/test diff and caught the legacy stored
  Prefix/schema conflict before installation. The corrected shared-Core
  migration removes only `ae.export.prefix` before ConfigManager construction;
  direct and real-storage regressions prove idempotence, sibling preservation,
  and continued rejection of other unknown keys.
- Focused Node gate: 68 passed (migration/Core, AE path, schema/integration,
  runtime staging, AE launcher, RuntimeManager).
- Focused Python gate: 39 passed (shared command adapter and export core).
- Full `npm test`: 390 Node tests and all Python discovery suites passed.
- `npm run package:win`: passed and visibly ran `runtime:stage` before build and
  Electron Builder. Existing Vite >500 kB chunk advisory only.
- `npm run package:verify`: passed for packaged CPython 3.13.14 x64.
- `npm run workflow:install:package`: passed in Copy mode and installed to the
  standard machine-wide Resolve Workflow Integration directory.
- Source, staged, packaged, and installed `resolve2ae_core/export.py` all match
  SHA-256 `886024C539448BA05CEB3A3619498C90F6753A3364092B49DB8EF116B6D288AD`.
  Source/package/installed hashes also match for the AE schema, shared Core, and
  Prefix migration module.
- User reported the real Resolve/AE host acceptance passed on 2026-08-31,
  closing foreground activation, Viewer target, Source-folder/Preview behavior,
  numbering, and ordinary/audio-only/video-only/Blue-range interaction gates.
