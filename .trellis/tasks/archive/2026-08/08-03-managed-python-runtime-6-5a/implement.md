# Phase 6.5A Runtime Registry and Resolver Implementation Plan

## Preconditions

- [ ] User approves the final PRD/design/implementation summary in a subsequent message.
- [ ] Start only `08-03-managed-python-runtime-6-5a`; keep `08-03-fix-resolve2ae-export-crash` paused in planning.
- [ ] Preserve `.claude/` and other unrelated worktree files.

## Implementation Checklist

### 1. Establish the baseline

- [ ] Run Script Runtime, Capability loader/registry, and full project tests plus production build.
- [ ] Confirm no runtime resource directory or existing version-selection helper already owns this contract.
- [ ] Record unrelated baseline failures before edits.

### 2. Add typed Runtime errors and Manifest loading

- [ ] Add `script-runtime/runtime/errors.js` with `RuntimeError`, stable codes, support status, and defensive details.
- [ ] Add `script-runtime/runtime/loader.js` following the existing synchronous JSON loader pattern.
- [ ] Read one versioned `{ schemaVersion, profiles }` Manifest; reject missing/unparseable payloads, unsupported schema versions, malformed entries, and duplicate ids atomically.
- [ ] Do not inspect runtime payload existence while loading.

Rollback point: loader/errors are isolated and unused until Registry/Resolver land.

### 3. Add Runtime Registry and schema validation

- [ ] Add `script-runtime/runtime/registry.js` with `register`, `get`, and `getAll`.
- [ ] Validate schema version, ids, runtime/implementation, canonical `runtimeVersion`, Node platform/architecture, unique Capability ids, host application/version prefix, contained relative executable, and `machine-verified` verification.
- [ ] Return defensive records and reject duplicate profile ids.
- [ ] Keep Python version values out of Feature, Provider, and Resolver branches.

### 4. Add deterministic Runtime Resolver

- [ ] Add `script-runtime/runtime/resolver.js` with injected Registry, runtime root, and filesystem seam.
- [ ] Validate the request and match runtime, platform, architecture, Capability, host application, and explicit host version prefix.
- [ ] Sort matches by numeric dotted runtime version descending, then id ascending.
- [ ] Resolve only contained absolute payload paths.
- [ ] Return `RUNTIME_UNSUPPORTED` for no profile and `RUNTIME_NOT_FOUND` for an absent selected payload.
- [ ] Never query PATH, invoke a subprocess, call Resolve, or silently select a lower execution backend.

### 5. Add authoritative Runtime Override

- [ ] Resolve an Override before Registry candidates.
- [ ] Require one absolute existing executable file.
- [ ] Return `source: "override"` and `supportStatus: "overridden"` without claiming verification.
- [ ] Fail invalid/missing Override immediately without Manifest or PATH fallback.

### 6. Add the machine-verified profile

- [ ] Add `resources/runtimes/manifest.json` with schema version 1 and one profile.
- [ ] Record Windows `win32`, `x64`, Resolve `versionPrefix: "20.3.2"`, Capability `ae.export`, CPython `3.13.1`, and `machine-verified`.
- [ ] Point to a future relative payload path; do not add/download Python runtime files in this phase.
- [ ] Assert the committed profile produces `RUNTIME_NOT_FOUND` while its payload is absent.

### 7. Add one focused runnable test file

- [ ] Add `script-runtime/runtime.test.js` using temporary Manifest/payload roots so the existing `npm test` glob runs it without package-script changes.
- [ ] Cover valid Manifest loading, every required field, malformed envelope, duplicate id, defensive results, and schema version.
- [ ] Cover platform, architecture, Capability, host application, and host-version mismatches.
- [ ] Cover `20.3.2` prefix matching `20.3.2.9`, highest numeric runtime selection, and deterministic tie breaking.
- [ ] Cover valid Override priority, relative/argument-bearing Override rejection, missing Override, `RUNTIME_UNSUPPORTED`, `RUNTIME_NOT_FOUND`, and all Support Status values.
- [ ] Prove no PATH fallback by asserting all success paths return an existing absolute file and no-result paths throw typed errors without process lookup.

### 8. Documentation and quality gate

- [ ] Avoid README launcher/setup changes because Phase 6.5A has no user-executable runtime behavior; capture durable contracts through Trellis spec workflow after implementation.
- [ ] Run `node --test script-runtime/runtime.test.js capability/*.test.js script-runtime/*.test.js script-runtime/providers/*.test.js`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` and `node --check` on new JavaScript modules.
- [ ] Boundary-search and confirm `PythonProvider.js`, hosts, Resolve2AE, Resolve adapter, and execution wiring contain no Phase 6.5A edits.

## Risky Files and Review Focus

- `script-runtime/runtime/registry.js`: strict schema validation without inventing a general-purpose schema framework.
- `script-runtime/runtime/resolver.js`: exact condition ownership, numeric ordering, path containment, Override short-circuit, and zero PATH fallback.
- Runtime Manifest: Python 3.13/profile values remain data-only and match the machine evidence.
- Tests: no tautological no-PATH assertion and no reliance on developer-machine runtime files.

## Completion Gate

- [ ] Every PRD acceptance criterion has automated evidence.
- [ ] Full-scope Trellis check passes.
- [ ] Any durable Managed Runtime contract is captured in backend specs before commit.
- [ ] Final report includes modules, Manifest schema, Resolver flow, Override rules, test results, and the Phase 6.5B integration seam.
