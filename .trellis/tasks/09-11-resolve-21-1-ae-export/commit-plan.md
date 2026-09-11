# Commit plan

## Proposed work commit

`fix(ae-export): support Resolve 21.1 native selection`

Includes Runtime compatibility restoration, all-three-mode selected-item/playhead targeting, obsolete Marker export deletion, focused tests and executable specs. Stage A user acceptance and Stage B independent verification are recorded. No remote push.

Before committing, create local branch `fix/resolve-21-1-ae-export` from the current main without resetting the working tree, and record it in Trellis. This keeps task base/main separate for later archive; all unrelated edits remain unstaged.

### Included paths

- .trellis/spec/backend/quality-guidelines.md — only AE selection/export hunks; exclude Diagnostic Sampler section
- resolve-command-center/README.md
- resolve-command-center/docs/resolve-python-matrix.md
- resolve-command-center/resolve/adapter.py
- resolve-command-center/resolve/test_adapter.py
- resolve-command-center/resolve/timeline_range.py — delete
- resolve-command-center/resolve/test_timeline_range.py — delete
- resolve-command-center/resolve2ae_core/export.py
- resolve-command-center/resolve2ae_core/tests/test_export_core.py
- resolve-command-center/resources/runtimes/manifest.json
- resolve-command-center/resources/runtimes/python-win32-x64.lock.json
- resolve-command-center/resources/runtimes/python-cpython-3.14.4-win32-x64.lock.json — add
- resolve-command-center/script-runtime/runtime.test.js
- resolve-command-center/scripts/resolve2ae_export.py
- resolve-command-center/scripts/test_resolve2ae_export.py
- resolve-command-center/scripts/stage-managed-python.ps1
- resolve-command-center/scripts/verify-package.js
- .trellis/tasks/09-11-resolve-21-1-ae-export/ — task artifacts, evidence, manual acceptance and this plan

### Excluded paths/hunks

- AGENTS.md — pre-existing orchestration instructions
- resolve-command-center/package.json — pre-existing diagnostics script
- .trellis/spec/backend/quality-guidelines.md — pre-existing Diagnostic Sampler section
- .trellis/tasks/09-02-fix-packaged-ae-export-status/research/native-bridge-crash-isolation.md
- .trellis/tasks/09-02-fix-packaged-ae-export-status/research/packaged-python-selection.md
- .trellis/tasks/09-04-add-diagnostic-sampler/
- resolve-command-center/scripts/diagnostic-sampler.test.js
- resolve-command-center/scripts/diagnostic-sampler/
- resolve-command-center/scripts/package-diagnostic-sampler.js
- build/ — generated Runtime qualification evidence, not source
- resolve-command-center/build/ and resolve-command-center/release/ — generated staging/package outputs

## Evidence

Final report: stage-b-check.md. Full npm test (410 Node tests and 78 Python tests), production build, refreshed package and both managed Runtime identities passed; final source/staged/package scans found no deleted range modules or bytecode. User accepted Stage A manually before cleanup.

## Bookkeeping after approved work commit

Archive this completed task and record its journal via Trellis. Do not archive unrelated active tasks. Bookkeeping commits follow the work commit. No push or amend.

## Approval status

User explicitly approved commit and archive with “提交并归档任务”. Local branch fix/resolve-21-1-ae-export was created without resetting unrelated changes. Execute this approved plan; record commit evidence in the journal after archival.
