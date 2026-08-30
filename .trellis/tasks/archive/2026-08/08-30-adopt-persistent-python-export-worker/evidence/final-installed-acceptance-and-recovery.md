# Final installed acceptance and recovery qualification

Date: 2026-08-30

## Scope and authority

- This evidence did not launch, close, focus, or automate Resolve or After
  Effects, and did not open or modify a user project.
- The user reported `验收通过` after restarting Resolve and exercising the
  installed final candidate on 2026-08-30. This is qualitative installed
  real-host acceptance only; it supplies no new timing measurement.
- Archived A/B performance evidence remains the quantitative authority:
  `archive/2026-08/08-30-ab-test-persistent-python-export-worker/evidence/performance-analysis.md`.
- This does not claim a live same-process Resolve restart. Closing Resolve
  closes the Workflow host and its worker.

## Installed managed-worker recovery harness

- A temporary trusted harness used the installed managed Runtime, installed
  persistent Bootstrap, and installed PersistentScriptLauncher. Its fixtures
  and worker directories were contained in the OS temporary directory and
  removed after completion.
- The forced-timeout request returned `RUNTIME_TIMEOUT` after **10094.044 ms**.
  It received one `script-execute` write, then its worker closed and its worker
  directory was removed before failure settlement. A distinct later safe
  request started exactly one replacement and succeeded. Generation count was
  2 and execute-write counts were `[1, 1]`; the timed-out request was not
  retried.
- The Resolve retirement fixture raised the actual installed
  `ResolveAdapterError` through installed `python_runner`, rather than a
  hand-written Node envelope. The failing script envelope settled only after
  the first worker closed, its directory was removed, and the dead session was
  cleared. An already queued request was not sent and received
  `RUNTIME_PROCESS_EXITED`; an immediate later safe request created exactly one
  replacement and succeeded. Generation count was 2 and execute-write counts
  were `[1, 1]`.
- Disposing each launcher left zero worker directories.

## Process check

- Read-only post-harness process inspection found zero installed
  persistent-Python workers and zero installed-host-owned PowerShell probe
  helpers.
- Eleven concurrent PowerShell probe helpers belonged to an unrelated Node
  test-runner ancestor. They were not installed-host children and were left
  untouched.

## Final installed identity

- The verified package was copied once more after the temporary harness so its
  generated Python bytecode cache did not remain in the installed Runtime.
- Source, staging, package, and installed copies of the persistent Bootstrap
  and wrapper are byte-identical. The staged, packaged, and installed Runtime
  inventories each contain 51 files with matching hashes.
- The packaged and installed command metadata each contain exactly the three
  current Export-to-AE Command ids; the installed wrapper has no retired id.
