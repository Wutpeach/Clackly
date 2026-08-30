# Installed B Recovery Qualification

Qualified on 2026-08-30 without launching, closing, or operating Resolve or
After Effects, and without opening a user project. This is recovery evidence
for the installed temporary B candidate, not AE composition-inspection evidence.

## Candidate and method

- Runtime label: `installed-workflow/plugin-runtime/python-3.13.14/win32-x64`.
- Launcher label: `installed-workflow/plugin-app/script-runtime/runtime/persistent.js`.
- Bootstrap label: `installed-workflow/plugin-runtime/.../clackly/persistent_bootstrap.py`.
- A temporary trusted harness under the OS temp directory loaded that installed
  launcher, its installed managed CPython 3.13.14 executable, and its installed
  persistent Bootstrap. It created only three temporary feature fixtures:
  `timeout`, `resolve-adapter-error`, and `safe`.
- The harness used the ordinary 10,000 ms parent timeout and a narrow wrapper
  around the actual child-process spawn only to count generations and
  `script-execute` writes. It emitted no project, timeline, clip, media, config,
  JSX, executable-path, or raw-error data.
- The temporary harness and all worker temporary directories were removed after
  qualification.

## Forced-timeout, no-retry, replacement gate

The first real feature request intentionally blocked beyond the parent deadline.

- Observed result: `RUNTIME_TIMEOUT` after **10,103.863 ms**.
- The timed-out generation received exactly one `script-execute` write, then
  closed and removed its worker directory before the failure settled.
- A later, separate safe request created exactly one replacement generation.
  That replacement received one write and returned the expected safe success
  envelope.
- Total generations: 2; request-write counts by generation: `[1, 1]`.
- Disposal closed the replacement and left zero worker directories.

This proves the failed request was not retried, the 10-second parent boundary
remained authoritative, and only a later command started the replacement.

## Actual ResolveAdapterError retirement gate

The first real feature executed through `python_runner` and raised the installed
`resolve.adapter.ResolveAdapterError` type. It did not use a handwritten Node
response envelope.

- The returned script envelope had `ok: false`, `error.type:
  ResolveAdapterError`, and the standard logs field. Its exact fixture envelope
  was observed only after the first worker closed, its worker directory was
  removed, and the dead session had been cleared.
- An already-overlapping safe request was never sent and rejected with the
  stable `RUNTIME_PROCESS_EXITED` retirement code.
- An immediate later safe request created exactly one replacement generation,
  received one request write, and succeeded.
- Total generations: 2; request-write counts by generation: `[1, 1]`.
- Disposal left zero worker directories.

This qualifies the real persistent-worker `ResolveAdapterError` retirement and
later-command replacement mechanism. It does **not** claim a live same-process
Resolve restart: quitting Resolve closes the Workflow Integration host and its
owned worker, so it cannot preserve stale fusionscript state for that experiment.

## Orphan check

Before the harness and after both launcher disposals, the count of
`persistent_bootstrap.py` / Clackly managed-Python processes was zero. The
qualification therefore left no persistent worker orphan.

## Deferred user acceptance

Visual AE composition inspection remains deferred by the user. The available
output evidence remains the existing automated six-policy public-result and JSX
parity checks; this harness did not create an AE composition.
