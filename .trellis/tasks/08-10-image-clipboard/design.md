# Design: Image Clipboard

## Existing Architecture Evidence

- `command-engine/registry.js` loads Command JSON manifests and `command-engine/executor.js` performs the Capability/config/enablement gates.
- `app/createClacklyCore.js` is the only shared Composition Root; architecture tests forbid Electron or WorkflowIntegration globals there.
- `capability/marker.js` is the existing hand-written Capability pattern and `FeatureStatusManager` consumes its `checkAvailability()` result.
- `resolve/adapter.js` serves direct Workflow Integration while `execution-adapter/bridge.js` serves the standalone host.
- Config schemas persist only explicit values and have no default-value model, so MVP defaults belong in the feature service.

## Boundaries and Data Flow

```text
Command manifest
  -> existing Command executor
  -> Image Clipboard Capability/service
      -> injected Host clipboard reader (PNG Buffer)
      -> filesystem persistence under configured root
      -> injected Resolve Media Pool adapter
          -> Workflow Integration Resolve object, or existing HTTP bridge
```

Electron Clipboard APIs remain in a small Host adapter shared by both Electron entrypoints. The application service accepts plain bytes and adapters only.

## Contracts

### Feature settings

`{ saveRoot, binName, organizeByProject }`, with defaults derived once from the Electron Host's `app.getPath("pictures")`.

### Resolve adapter

- `isAvailable()` reports runtime readiness without treating transient Clipboard contents as Feature readiness.
- `getCurrentProjectName()` validates Resolve/project access before choosing a disk destination.
- `importMediaToBin({ diskPath, binName })` owns Media Pool root lookup, direct-child bin reuse/creation, current-folder switching, import, and restoration.

### Result and errors

Success returns `{ diskPath, mediaPoolBin, projectName }` and may include `warnings`. Failures are thrown Error objects with `code` and `details`; later-stage errors include `diskPath` after persistence.

## Transaction Semantics

1. Read and validate Clipboard PNG bytes: failure has no side effects.
2. Read the current Resolve project name and derive a contained destination: failure has no disk side effects.
3. Create the destination directory and exclusively write a collision-safe PNG: failure has no Media Pool side effects.
4. Resolve/reuse/create the root-level target bin and import the PNG.
5. Restore the original Media Pool folder in `finally`. Restoration does not roll back a valid disk write or completed import.

## Path Safety

The feature uses a minimal testable helper that sanitizes one filesystem segment and verifies `path.relative(saveRoot, candidate)` neither becomes absolute nor begins with `..`. File creation uses exclusive semantics and retries with a bounded numeric suffix.

## Compatibility and Scope

- The direct JS Resolve adapter receives new Media Pool methods.
- The existing bridge request envelope gains optional command fields for project lookup and import; no new endpoint/runtime is introduced.
- No UI component or Settings architecture change is required. The command appears through existing metadata-driven UI.

## Rollback Shape

All code is additive or extends existing adapter methods. Reverting the Command/Capability registration removes user exposure; written PNG files are user data and are never deleted as rollback.
