# AE export runtime, naming, organization, and activation design

## Architecture and data flow

The authoritative execution path remains:

```text
three active Export-to-AE Commands + legacy interaction migrations
  -> ae.export Capability + scoped config
  -> ScriptCapabilityProvider / RuntimeManager
  -> dedicated managed persistent Python worker
  -> scripts/resolve2ae_export.execute
  -> resolve2ae_core.export.process_and_send
  -> one bounded After Effects JSX launch plan
  -> host-owned AfterEffectsLauncher
  -> current AE project
```

Product behavior changes at two existing owners only:

1. `capability/definitions/ae-export.json` removes the unused `prefix` field.
2. `resolve2ae_core/export.py` generates project-aware JSX for sequence
   allocation, comp/folder creation, final Viewer selection, and AE activation.

`scripts/resolve2ae_export.py` stops adapting Prefix but retains the one shared
policy/config bridge. Packaging scripts refresh and verify the existing managed
runtime artifact; they do not alter its runtime protocol.

## Managed-runtime freshness contract

`package:win` must make staging an explicit precondition:

```text
current repository Python sources
  -> runtime:stage
  -> build/runtime-staging/runtimes
  -> electron-builder extraResources
  -> release/win-unpacked/resources/runtimes
  -> Workflow installer/package copy
```

The staging test should prove the package command invokes `runtime:stage` before
Electron Builder. Package verification should compare a current-source identity
against staging and package identity instead of comparing package only with
staging. Reuse the staging manifest/inventory and hashing utilities where
available; do not introduce a second runtime manifest format merely for this
feature.

The final operational check must inspect the packaged and installed
`resolve2ae_core/export.py` (or their recorded hashes) and prove they contain the
same current source behavior before asking for Resolve retesting.

## One-pass AE project inspection

The export core emits a small local JSX block before creating Source. The block
iterates `app.project.items` exactly once and collects:

- the first `FolderItem` whose name is exactly `Clackly Source Comps`, regardless
  of its parent folder;
- the greatest numeric suffix among `CompItem` names that match the exact
  current timeline name under the Clackly naming grammar, regardless of the
  resolution token and whether the item is Source or `-Preview`.

The loop inspects only AE project item type and name. AE's project collection is
already flat, so folder movement does not require recursive tree traversal.
Unrelated FootageItem/FolderItem/CompItem entries are constant-time skips.

After the loop, `sequence = maxSequence + 1`. If no match exists, it is `1`.
The source and optional Preview names are assembled from the same sequence:

```text
sourceName  = "[" + sourceWidth + "x" + sourceHeight + "]-" + timelineName + "-" + sequence
previewName = "[1920x1080]-" + timelineName + "-" + sequence + "-Preview"
```

Timeline-name comparison is exact and resolution-independent. The JSX literal
for the timeline name must be encoded safely from Python rather than inserted
as an unescaped single-quoted fragment. Keep this encoding local to the naming
block; this task does not generalize all existing exporter string handling.

If more than one folder has the fixed name, the first in AE project item order
is reused deterministically and no new folder is created.

## Composition construction and organization

Source construction remains the canonical path: the same timeline dimensions,
duration, frame rate, pixel aspect, layers, timing offsets, media policies,
effects, and transforms target the same `comp` variable.

When Preview is disabled:

- Source is created at project root with the new source name.
- No source-folder or Preview item is created.
- Source is the final Viewer target.

When Preview is enabled, after Source is completely populated:

1. Reuse the folder found by the one-pass scan or create
   `Clackly Source Comps` at project root.
2. Set `comp.parentFolder` to that folder.
3. Create Preview at 1920 x 1080 using `comp.duration` and `comp.frameRate`.
4. Explicitly set Preview's parent to `app.project.rootFolder`.
5. Add `comp` once as a nested layer, center it, and set identical X/Y scale to
   `Math.min(preview.width / comp.width, preview.height / comp.height) * 100`.
6. Use Preview as the final Viewer target.

This keeps the Source usable and non-destructive while presenting only the
wrapper at the root when enabled. A 1920 x 1080 Source still receives a wrapper
at 100% scale and the fixed `-Preview` suffix keeps names distinct.

## Viewer and activation order

Replace the early unconditional `comp.openInViewer()` with one final target
selection after all requested construction:

```text
finalComp = preview enabled ? previewComp : comp
finalComp.openInViewer()
app.activate()
app.endUndoGroup()
```

The generated JSX contains one `openInViewer()` and one activation action. All
command policies inherit it because it is emitted after their shared media
construction. The host still launches exactly one validated JSX plan and does
not learn which comp is selected.

`app.activate()` is treated as an AE-host behavior requiring real warm/cold
validation. If it cannot reliably foreground AE, implementation returns to the
architecture gate instead of adding Windows focus APIs or retry logic in the
runtime/launcher layers.

## Configuration compatibility

Removing `prefix` from the manifest removes it from the generic Settings
projection. Because ConfigManager intentionally rejects unknown keys, existing
config documents require a silent migration before their next schema-validated
read. Keep that migration in the configuration/capability-initialization layer:
remove only `ae.export.prefix`, preserve sibling AE values and unrelated
capability sections, and retain the global unknown-key rejection contract. No
Renderer branch or migration UI is necessary. The shared adapter also stops
reading or forwarding Prefix.

`aePath` and `create1080pPreviewComp` retain their current keys, validation, and
localization. All three Commands continue receiving one capability-scoped
snapshot through the existing execution path.

## Testing strategy

- Schema/integration tests assert the exact remaining AE settings, prove no
  feature-specific Renderer branch is introduced, and cover the silent legacy
  Prefix removal without weakening unknown-key validation.
- Adapter tests prove legacy Prefix is ignored and all three command policies
  still forward the Preview boolean through one entry.
- Export-core JSX tests characterize one project-item loop, exact sequence
  grammar, independent timelines, max-plus-one gaps, resolution changes,
  Source/Preview shared numbering, 1080p collision avoidance, folder reuse and
  creation, root placement, final Viewer target, and activation order.
- Existing Fit tests continue covering 3840 x 2160 at 50% and 2048 x 1536 at
  70.3125%, with source timing/content assertions unchanged.
- Packaging tests prove stage-before-package and current-source identity across
  source, staging, and packaged runtime.
- Real Resolve/AE smoke is the authority for foreground behavior, moved-folder
  reuse, actual project-browser placement, and installed-runtime freshness.

## Rollback and risk

- Packaging freshness can be rolled back independently from JSX product
  behavior, but a release must never be produced from stale staging.
- Naming is intentionally a visible behavior change; old Prefix values remain
  readable data but have no effect. No attempt is made to rename existing AE
  items.
- Sequence discovery is O(project item count) once per export. It deliberately
  favors accurate current-project state over a faster persistent counter that
  could drift after user edits.
- AE permits duplicate item names created manually. Clackly avoids duplicate
  names relative to matching Clackly items by max-plus-one, but cannot reserve a
  name against a simultaneous independent script; concurrent exports are not a
  supported scenario.

## New abstractions and dependencies

No cross-boundary dependency or generalized layout/index framework is added.
At most, export-core-local JSX helpers/constants express safe string literals,
the fixed folder name, and the single scan/naming block. The managed-runtime
manifest/hashing mechanism remains the packaging identity authority.
