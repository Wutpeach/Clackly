# Phase 6.5C Resolve Compatibility Probe Implementation Plan

## Preconditions

- [ ] User approves the final PRD/design/implementation summary in a subsequent message.
- [ ] Run `task.py start` only after that approval and keep unrelated active/untracked work intact.
- [ ] Load implementation context through the configured Trellis dispatch workflow.

## Implementation Checklist

### 1. Establish the baseline

- [ ] Run focused Runtime/Launcher/Bootstrap tests, full project tests, Python compilation, and production build.
- [ ] Record unrelated baseline failures before editing.
- [ ] Reconfirm the current Resolver status vocabulary, Launcher result/error envelope, and Bootstrap protocol.

### 2. Extend Bootstrap with `resolve-probe`

- [ ] Preserve `runtime-info` unchanged and share its runtime record validation.
- [ ] Validate the operation request and ordered architecture, Runtime version, module path, and library path checks.
- [ ] Apply explicit bridge paths inside the isolated child, import `DaVinciResolveScript`, connect through `scriptapp("Resolve")`, and read/verify the Resolve version.
- [ ] Return the required structured error codes without raw exceptions or stdout noise.
- [ ] Add fake-module Python tests for every controlled success/failure branch.

Rollback point: `runtime-info` tests must still pass before JavaScript orchestration begins.

### 3. Add status diagnostics and fingerprint/cache primitives

- [ ] Add `runtime/probe.js` exporting the five requested named concepts.
- [ ] Implement the exact `supportStatus` preservation, `probeStatus`, `effectiveStatus`, and `CUSTOM_RUNTIME_UNVERIFIED` table as one pure derivation function.
- [ ] Implement canonical bridge discovery and the fixed schema-version-1 fingerprint, including the Override observed-version rule.
- [ ] Wrap `ConfigStorage` for one defensive atomic cache record; treat read/schema failures as misses, save only passed results, and clear on fresh failure.
- [ ] Keep cache write/delete errors subordinate to the real Probe result.

### 4. Add ResolvePythonProbe and RuntimeProbe orchestration

- [ ] Validate the Resolver-shaped input and explicit version/path/force values without changing Resolver.
- [ ] Implement cache hit/miss/stale/force behavior and ensure a hit performs no spawn.
- [ ] Invoke `RuntimeLauncher` exactly once for each uncached Probe with request data only on stdin.
- [ ] Map Bootstrap errors, preserve timeout, map operation-native crashes to `RUNTIME_NATIVE_BRIDGE_CRASH`, and retain bounded process evidence.
- [ ] Return formal top-level three-axis statuses, warnings, runtime/Resolve/bridge records, cache disposition, and sanitized errors.

### 5. Add focused Node tests

- [ ] Cover every status derivation and prove Resolver support is never promoted or hidden.
- [ ] Cover Override passed warning and unsupported passed warning readiness.
- [ ] Cover every fingerprint field, managed and Override cache hits, stale invalidation reasons, force bypass, corrupt reads, atomic saves, clear-on-failure, and write failure.
- [ ] Cover required error mapping, structured diagnostics, defensive results, and no second process/environment implementation.
- [ ] Import an aborting fake bridge only through the real isolated Probe; prove parent survival, cache invalidation, and a following successful Probe.

### 6. Current-machine acceptance

- [ ] Locate and record the exact Resolve executable, `DaVinciResolveScript.py`, `fusionscript.dll`, Clackly version, CPython executable/version, platform, architecture, and mtimes.
- [ ] Run the new Probe against Resolve 20.3.2 with CPython 3.13.x x64 and record the complete sanitized miss result.
- [ ] Repeat unchanged to record a cache hit with no Python spawn.
- [ ] If 3.11/3.12 are exercised, invoke them only through the new isolated Probe and record crash/failure without importing in the parent.

### 7. Quality gate and project knowledge

- [ ] Run `node --test script-runtime/runtime-probe.test.js script-runtime/runtime-launcher.test.js script-runtime/runtime.test.js script-runtime/providers/PythonProvider.test.js`.
- [ ] Run `python -m unittest discover -s script-runtime -p "test_*.py"` and compile changed Python files.
- [ ] Run `npm test` and `npm run build` from `resolve-command-center`.
- [ ] Run Node syntax checks, `git diff --check`, and boundary searches for PATH lookup, inherited Resolve/Python variables, duplicate spawn/cache implementations, status promotion, production Provider/UI integration, and new dependencies.
- [ ] Update the backend quality spec with the settled Probe/status/cache contract.
- [ ] Record live acceptance under the task and complete the Trellis full-scope check before commit.

## Risky Files and Review Focus

- `runtime/bootstrap.py`: native import must occur only after ordered pure checks; stdout must remain one envelope.
- `runtime/probe.js`: status-table completeness, Override provenance, cache trust boundary, canonical paths/mtimes, Launcher error mapping, and defensive diagnostics.
- Abort test: never import the aborting or real Resolve bridge in the test parent; keep subprocess timeouts bounded.
- Cache persistence: a cache optimization must never mask a passed/failed compatibility result.

## Completion Gate

- [ ] Every PRD acceptance criterion has automated evidence or explicit current-machine evidence.
- [ ] The final PRD remains converged with no blocking questions.
- [ ] Full-scope Trellis check passes after fixes.
- [ ] Final report lists files, status derivation, cache behavior, error mapping, exact machine versions, complete Probe results, validation commands, and deferred integration/PE work.

