# Phase 6.5B Isolated Runtime Launcher Implementation Plan

## Preconditions

- [ ] User approves the final PRD/design/implementation summary in a subsequent message.
- [ ] Start only `08-03-isolated-runtime-launcher-6-5b`; keep `08-03-fix-resolve2ae-export-crash` paused in planning.
- [ ] Preserve `.claude/` and other unrelated worktree files.

## Implementation Checklist

### 1. Establish the baseline

- [ ] Run Managed Runtime, PythonProvider, Script Runtime, full project tests, Python compilation, and production build.
- [ ] Confirm the current test globs, process/event semantics, and absence of an existing isolated launcher/environment helper.
- [ ] Record unrelated baseline failures before editing.

### 2. Define typed Runtime execution failures

- [ ] Reuse the existing `RuntimeError` unchanged and emit the stable execution codes from `RuntimeLauncher`; do not add subclasses or a constants module used once.
- [ ] Keep error details defensive, JSON-safe, and bounded for malformed values and process output.
- [ ] Add the exact launch/executable/spawn/stdin/timeout/output/crash/exit/protocol/Bootstrap/cleanup codes from `design.md`.

Rollback point: the existing error module remains unchanged until Launcher consumes it.

### 3. Add the pure Runtime Environment builder

- [ ] Add `script-runtime/runtime/environment.js`.
- [ ] Build exactly the four-key Windows environment or one-key non-Windows environment without spreading `process.env`.
- [ ] Read Windows source keys case-insensitively, canonicalize output casing, require `SystemRoot`, set launcher-owned temp variables, and return a fresh record.
- [ ] Cover every forbidden Python/virtual-environment key and unrelated-variable exclusion.

### 4. Add the Python Bootstrap

- [ ] Add `script-runtime/runtime/bootstrap.py` using only the Python standard library.
- [ ] Read one stdin JSON object, support only `runtime-info`, and emit the exact structured success/failure envelopes.
- [ ] Derive pointer width and canonical executable without subprocess or PATH lookup.
- [ ] Write one UTF-8 response to real stdout; never place diagnostics or request data on argv.
- [ ] Add `script-runtime/test_runtime_bootstrap.py` covering valid runtime info, invalid root/operation/JSON, isolated environment, and absolute executable.

### 5. Add Runtime Launcher lifecycle

- [ ] Add `script-runtime/runtime/launcher.js` with approved defaults and injectable seams.
- [ ] Validate resolution, executable, Bootstrap path, request, and numeric limits before temp creation/spawn.
- [ ] Canonicalize the executable immediately before launching fixed flags with `shell: false`, `windowsHide: true`, isolated cwd/env, and three pipes.
- [ ] Send one serialized request through stdin EOF.
- [ ] Capture Buffer chunks with separate byte counters and bounded retained diagnostics.
- [ ] Implement one timeout, first-overflow termination, one force kill, close-based finalization, and single settlement across error/close/stdin races.
- [ ] Build the defensive `RuntimeProcessResult`, distinguish every typed terminal condition, and preserve Windows native exit hex/signal evidence.
- [ ] Clean temp state after every path; attach cleanup diagnostics without replacing a primary failure.

### 6. Add one real failure worker and focused Node tests

- [ ] Add `script-runtime/runtime/fixtures/test_worker.py` with all modes selected from stdin JSON only.
- [ ] Add `script-runtime/runtime-launcher.test.js` under the existing test glob.
- [ ] Cover exact executable/argv/options/stdin/environment, success/result defensiveness, and no PATH/search behavior.
- [ ] Cover structured Python exception, non-zero exit, empty output, invalid JSON/envelope, stdout/stderr overflow, timeout, spawn/stdin errors, uninitiated signal/native abort, kill-once/wait-close, and cleanup on every path.
- [ ] Prove the Node parent continues after the abort fixture and do not assert one cross-platform crash code.

### 7. Documentation and quality gate

- [ ] Do not edit README or production integration because Phase 6.5B adds no user-executable path.
- [ ] Run `node --test script-runtime/runtime-launcher.test.js script-runtime/runtime.test.js script-runtime/providers/PythonProvider.test.js`.
- [ ] Run `python -m unittest discover -s script-runtime -p "test_*.py"`.
- [ ] Run `python -m py_compile script-runtime/runtime/bootstrap.py script-runtime/runtime/fixtures/test_worker.py`.
- [ ] Run `npm test` and `npm run build`.
- [ ] Run `node --check` on new JavaScript, `git diff --check`, and owned-file whitespace checks.
- [ ] Boundary-search for PATH/search commands, bare interpreters, `process.env` spreading, request data in argv, Provider/host/Resolve integration, and unexpected dependencies.

## Risky Files and Review Focus

- `runtime/launcher.js`: `error`/stdin/stream/timeout/close races, byte-bounded capture, kill-once, final cleanup, and primary-error preservation.
- `runtime/environment.js`: exact allowlist, case-insensitive Windows lookup, no accidental PATH or parent-environment inheritance.
- `runtime/bootstrap.py`: stdout protocol purity, exact envelope, pointer-width architecture, and zero Resolve imports.
- Real worker tests: no hangs, no orphan process, no platform-specific crash-code assumption, and temporary directories gone before settlement.

## Completion Gate

- [ ] Every PRD acceptance criterion has automated evidence or an explicit platform limitation.
- [ ] Full-scope Trellis check passes after any fixes.
- [ ] The settled Launcher/environment/protocol/error contract is captured in backend specs before commit.
- [ ] Final report lists modules, environment policy, process/result/error flow, Bootstrap protocol, test results, and the next-phase Probe integration seam.
