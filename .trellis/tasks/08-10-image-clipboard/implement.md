# Implementation Plan: Image Clipboard

1. Add the Command manifest and a hand-written Image Clipboard Capability/service with centralized defaults, structured errors, project-segment sanitization, root containment, exclusive collision-safe PNG persistence, and transaction orchestration.
2. Add the Electron Host clipboard adapter and inject it, the Pictures root, and the matching Resolve adapter from both existing Host entrypoints through `createClacklyCore`.
3. Extend the direct JS Resolve adapter with project-name and Media Pool import operations, including direct-child bin lookup/creation and `finally` restoration warnings.
4. Extend the existing standalone bridge adapter and Python Resolve bridge command dispatch with equivalent project-name/import behavior; keep the current endpoint and runtime.
5. Add focused Node/Python tests for Clipboard/disk/security transactions, Command/Capability registration, direct Resolve behavior, bridge forwarding, and composition boundaries.
6. Run focused tests, the full `npm test`, packaging verification where relevant, and an architecture search for forbidden Electron/Core and timeline-insertion changes.
7. Review the diff and worktree, update Trellis specs only if a reusable convention was learned, create the required work commit(s), archive the task, and record the session journal.

## Validation Commands

- `node --test capability/imageClipboard.test.js resolve/adapter.test.js command-engine/registry.test.js app/createClacklyCore.test.js execution-adapter/bridge.test.js electron/main/composition.test.js`
- `python -m unittest discover -s bridge -p "test_*.py"`
- `python -m unittest discover -s resolve -p "test_*.py"`
- `npm test`
- `npm run package:verify`
- `git diff --check`
- architecture `rg` checks for Electron imports in Core/application feature code and Timeline insertion APIs in the new feature.

## Risk and Rollback Points

- Resolve folder objects can arrive through JS/Python wrappers with different list shapes; normalize direct child collections and test array/object forms.
- A bridge envelope change must remain backward-compatible with marker commands and existing tests.
- Never delete the generated PNG during Resolve or restoration failure handling.
