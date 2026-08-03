# After Effects Path Auto-Discovery Implementation Plan

## Preconditions

- [ ] User approves the final PRD/design/implementation summary in a subsequent message.
- [ ] Start the task only after approval; product code remains unchanged while status is `planning`.
- [ ] Review the baseline worktree and preserve unrelated user changes.

## Implementation Checklist

### 1. Establish the baseline

- [ ] Run the focused configuration, feature-status, capability, host, and Resolve2AE wrapper tests.
- [ ] Run `npm test` and `npm run build` from `resolve-command-center/` before edits, recording unrelated baseline failures.
- [ ] Confirm the real Windows test machine exposes `AfterFX.exe` through the running process, App Paths, or a standard Adobe directory without depending on that result in automated tests.

### 2. Add the feature-owned detector and initializer

- [ ] Add `capability/afterEffectsPath.js` using only Node/Windows native facilities.
- [ ] Preserve a valid saved `ae.export.aePath` without running discovery or writing configuration.
- [ ] Implement the ordered running-process, App Paths, and standard-directory strategies; validate every returned candidate as an existing file.
- [ ] Parse numeric After Effects directory versions and choose the highest candidate deterministically.
- [ ] Persist a discovered path with `ConfigManager.update("ae.export", { aePath })` so sibling settings remain intact.
- [ ] When a previously saved path is stale and no replacement exists, remove only `aePath` through the existing ConfigManager save contract while preserving sibling settings.
- [ ] Return without mutation on non-Windows platforms or when no path was ever configured and no candidate exists.
- [ ] Keep expected strategy failures recoverable while allowing configuration/storage contract errors to remain visible.

Rollback point: the new module is isolated and unused until host composition lands.

### 3. Add one focused runnable test

- [ ] Add `capability/afterEffectsPath.test.js` with injected seams and temporary files.
- [ ] Cover valid-path short-circuit, discovery precedence, strategy fallback, App Paths result, highest standard version, stale replacement, stale removal with prefix preservation, no-result no-op, and non-Windows behavior.
- [ ] Assert no external process/registry scan occurs when the saved path is still valid.

### 4. Initialize both Clackly hosts

- [ ] Invoke the shared initializer in `electron/main/main.js` during `app.whenReady()` before palette creation and IPC registration.
- [ ] Invoke the same initializer in `workflow-plugin/main.js` after Workflow Integration initialization attempt and before palette creation and IPC registration.
- [ ] Keep Command Engine, FeatureStatusManager, FeatureCatalog, generic Settings IPC, renderer, Script Runtime, and Resolve2AE core free of AE-specific branches.
- [ ] Confirm both hosts continue using shared `appData/Clackly/config.json` and the operation remains safe if both hosts initialize sequentially.

Rollback point: remove the two startup calls; existing manual configuration behavior is restored.

### 5. Preserve existing configuration and execution contracts

- [ ] Keep `aePath` required in `capability/definitions/ae-export.json` so failed discovery retains existing missing-config recovery.
- [ ] Keep `scripts/resolve2ae_export.py` as the final trust-boundary file check; do not let startup discovery replace execution validation.
- [ ] Do not add Settings auto-fill state, AE-specific IPC, a generic plugin lifecycle, a global AE service, or a new dependency.
- [ ] Update `resolve-command-center/README.md` to describe automatic Windows discovery, persisted value, manual override, order, and failure recovery.

### 6. Automated quality gate

- [ ] Run `node --test capability/afterEffectsPath.test.js config/*.test.js feature-status/*.test.js feature-ui/*.test.js electron/main/*.test.js`.
- [ ] Run `python -m unittest discover -s scripts -p "test_*.py"`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Boundary-search for AE-specific discovery references and confirm they occur only in the feature module, its tests/docs, and the two host composition calls.

### 7. Manual Windows acceptance gate

- [ ] Back up/remove only the `ae.export.aePath` test value, start Clackly, and verify a real installed AE path is persisted and displayed in Settings.
- [ ] Restart Clackly and verify the valid saved value is preserved without rediscovery.
- [ ] Set a temporary stale path, restart, and verify it is replaced by the installed AE path while `prefix` is preserved.
- [ ] Save a different valid AfterFX path manually and verify startup preserves it.
- [ ] Exercise running AE, installed-but-not-running AE, and no-discoverable-AE recovery where the environment permits.
- [ ] Execute an AE export to confirm the persisted path reaches the existing Python wrapper and launch flow.

## Risky Files and Review Focus

- `capability/afterEffectsPath.js`: Windows command output parsing, deterministic version ordering, and no arbitrary/full-disk execution search.
- `electron/main/main.js` and `workflow-plugin/main.js`: initializer ordering and startup failure behavior.
- Shared config file behavior: preserve `prefix`, unrelated capabilities, manual override, and existing last-writer-wins contract.

## Completion Gate

- [ ] Every PRD acceptance criterion has automated or recorded manual evidence.
- [ ] Full-scope Trellis check passes after the final implementation iteration.
- [ ] Any new durable startup/config contract is reflected in backend specs before commit.
- [ ] User-visible behavior and limitations are documented.
