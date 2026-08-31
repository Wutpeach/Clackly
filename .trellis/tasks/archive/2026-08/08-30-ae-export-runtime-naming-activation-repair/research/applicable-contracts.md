# Applicable repository contracts and evidence

## Ownership

- `.trellis/spec/backend/quality-guidelines.md:557-589` keeps Resolve timeline
  range policy and optional AE presentation in the export core. Command
  manifests, Resolve adapters, RuntimeManager, persistent bootstrap/launcher,
  and the host AE launcher do not own Preview layout.
- `.trellis/spec/backend/quality-guidelines.md:1086-1136` defines managed Python
  staging/package identity, the isolated runtime, and host-owned one-shot JSX
  launch.
- `.trellis/spec/backend/quality-guidelines.md:656-700` defines the existing
  running/cold After Effects desktop launch boundary.
- `.trellis/spec/guides/cross-layer-thinking-guide.md` requires explicit data
  flow and one owner per contract.
- `.trellis/spec/guides/code-reuse-thinking-guide.md` requires searching before
  changing config/constants and avoiding duplicate behavior across consumers.

## Repository evidence

- `resolve-command-center/package.json:12-13,34-39`: runtime staging exists but
  is not a `package:win` prerequisite; packaging copies the existing staging
  tree.
- `resolve-command-center/scripts/verify-package.js:62-75`: verification uses
  staging as package comparison authority and cannot independently detect stale
  source staging.
- `resolve-command-center/scripts/stage-managed-python.test.js:20-79`: current
  tests characterize staging/verification scripts and are the narrow location
  for the stage-before-package/freshness regression.
- `resolve-command-center/capability/definitions/ae-export.json:22-39`: the
  schema owns `aePath`, the unused `prefix`, and `create1080pPreviewComp`.
- `resolve-command-center/scripts/resolve2ae_export.py:6-40`: all active AE
  command IDs map to one shared policy bridge; it currently normalizes Prefix
  and forwards the Preview boolean.
- `resolve-command-center/resolve2ae_core/export.py:578-621`: the export core
  owns timeline dimensions, current timestamp/prefix name, Source creation, and
  early Source Viewer selection.
- `resolve-command-center/resolve2ae_core/export.py:1019-1034`: the same core
  owns optional Preview creation and the final JSX launch plan.
- `resolve-command-center/capability/afterEffectsLaunch.js:191-219`: the host
  only writes/launches validated JSX and preserves running/cold behavior.
- `resolve-command-center/interaction/BindingStorage.js:6-14`: retired Blue and
  Cyan command IDs migrate to the active video-only/audio-only commands.

## Planning conclusions

- The observed missing Preview is a stale managed-runtime package, not a
  Capability config or shared-command-path failure.
- Sequence/folder discovery is current AE project state and belongs in the same
  generated JSX request; it must not be persisted in the Python worker.
- `app.project.items` is a flat project collection, so one O(n) item pass can
  find a moved folder and maximum sequence without recursive media traversal.
- `comp.openInViewer()` selects a Viewer but is not a foreground contract. One
  shared AE-side activation action must be validated in warm and cold real AE.
- Package/install validation is a release requirement, not optional evidence,
  because source-only tests previously passed while the installed runtime was
  stale.
