# Optional 1080p AE preview composition implementation plan

## Ordered implementation

1. Add `create1080pPreviewComp` as an optional boolean to the `ae.export`
   manifest, with English and Simplified Chinese labels.
2. Extend metadata/config tests to prove the field is valid, localized, and
   default-off when absent; retain the generic boolean-to-checkbox renderer
   contract without editing Renderer product code.
3. In `scripts/resolve2ae_export.py`, read the scoped boolean and include its
   effective value in the existing config passed to `process_and_send()`.
4. Extend the shared-entry tests so all three `COMMAND_POLICIES` cases prove the
   identical config flow, while absent/false stays disabled.
5. In `resolve2ae_core/export.py`, add one guarded local JSX block after all
   source layers are generated and before `app.endUndoGroup()`:
   - derive `<source-name>_Preview_1080p`;
   - create 1920 x 1080 square-pixel comp using `comp.duration` and
     `comp.frameRate`;
   - add `comp` once as a layer;
   - explicitly center it;
   - set uniform scale from the minimum width/height ratio.
6. Add focused export-core tests for enabled 3840 x 2160 and 2048 x 1536 cases,
   including construction order, source preservation, 50 percent, 70.3125
   percent, equal axes, and absence of crop/stretch operations.
7. Run focused tests, then the package-wide test/build gates. Inspect the final
   diff for forbidden changes to Commands, Resolve adapters, TimelineRange,
   Renderer branching, and persistent-worker infrastructure.

## Validation commands

Run from `resolve-command-center/` unless noted:

```powershell
python -m unittest scripts.test_resolve2ae_export resolve2ae_core.tests.test_export_core
node --test capability/registry.test.js config/SchemaValidator.test.js script-runtime/integration.test.js electron/renderer/model.test.mjs electron/renderer/localizationPresentation.test.mjs
npm test
npm run build
```

Also run repository searches/diff checks that prove:

- all three active AE Command ids still point only to `ae.export`;
- `script-runtime/runtime/manager.js` and persistent worker files are unchanged;
- no `ae.export` conditional or new duplicate state appears in Renderer code;
- existing disabled snapshot fixture files are unchanged.

If package scripts expose a narrower authoritative AE integration command, add
it to the validation record rather than replacing the full gates above.

## Review gates

- Planning approval: the user explicitly approves this PRD/design/plan before
  `task.py start` or any product-code edit.
- Architecture gate: stop if implementation needs a new runtime route, renderer
  branch, Resolve ownership change, or worker protocol change.
- Regression gate: do not update existing snapshot baselines merely to make the
  disabled path pass.
- Quality gate: the Lead reviews the Worker's actual diff and independently
  verifies the relevant test/build results before completion.

## Risk and rollback points

- AE JSX property names/values are runtime-sensitive. Keep the block simple and
  cover exact generated statements plus arithmetic semantics in unit tests.
- Do not interpolate a second independently assembled name; derive the wrapper
  from the same `comp_name` value.
- Do not calculate timing independently from selected clip frames in the
  wrapper; reuse source-comp properties.
- If disabled snapshots change, roll back the core change and re-place the
  conditional so false/absent appends nothing.
- If schema-driven Settings needs Renderer code, stop as an architecture
  conflict rather than adding a Capability-specific branch.
