# Capability Metadata Implementation Plan

## Implementation

- [x] Add the `marker.add` metadata object to `createMarkerCapability()` without changing `add`, `execute`, `selectBackend`, or backend definitions.
- [x] Extend `createCapabilityRegistry()` registration validation for the metadata contract and matching capability id.
- [x] Add `getMetadata()` and `getAllCapabilities()` while preserving `register()` and `get()` behavior.
- [x] Expand the focused registry test for full lookup, unknown lookup, summary projection, and invalid metadata.
- [x] Add one marker capability metadata assertion while retaining all execution tests unchanged.
- [x] Update the backend capability contract and README to document metadata queries and the execution/description boundary.
- [x] Search for callers that assume the registry exposes only `register()` / `get()` or that duplicate capability metadata elsewhere.

## Validation

- [x] `node --check capability/registry.js capability/marker.js`
- [x] `node --test capability/*.test.js command-engine/*.test.js`
- [x] `npm test`
- [x] `npm run build`
- [x] `rg -n "getMetadata|getAllCapabilities|marker.add" capability command-engine electron workflow-plugin README.md`
- [x] Review the final diff to confirm execution adapter and backend-selection logic are unchanged.

## Risky Files and Rollback Points

- `capability/registry.js`: keep the existing `Map`, registration signature, duplicate protection, and `get()` result shape.
- `capability/marker.js`: metadata addition only; do not alter backend ordering or fallback semantics.
- If compatibility tests fail, revert metadata validation/query additions without touching command execution or adapters.

## Review Gate

- [x] PRD acceptance criteria are mapped to tests or explicit boundary searches.
- [x] No Plugin Manifest, SDK, discovery, dynamic loading, IPC, or UI work appears in the diff.
- [x] Final Trellis quality check passes before completion.
