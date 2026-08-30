# Clean A Restoration

Completed on 2026-08-30 after the B performance and recovery evidence was retained.

## Source and qualification

- All B-only persistent launcher, Bootstrap, profiler, lifecycle, staging, and test code was removed.
- Product and test source returned to exact HEAD parity; only this active task directory remained untracked.
- The accepted host-owned persistent PowerShell After Effects process helper remained intact.
- Full clean-A validation passed: 365 Node tests and Python suites 6 + 26 + 15 + 32 + 2.
- Production build, Node syntax checks, Python compilation, `git diff --check`, Resolve2AE source parity, and B-marker/privacy sweeps passed.

## Clean package and installation

- Resolve and After Effects were confirmed closed before installation.
- `npm run runtime:stage`, `npm run package:win`, and `npm run package:verify` passed.
- The verified package was installed in Copy mode at the standard machine-wide Workflow Integration path.
- Source, package, and installed hashes matched:
  - `script-runtime/runtime/manager.js`: `141C907F981C81F64ACDBE31B1A30DB0A739DF964848DAE84DD1889BE56F9139`
  - `app/createClacklyCore.js`: `88EEB600415C37BB6AE423A3DA51BE42B32FCFC689E080ADE80693C9F315BE59`
  - managed Runtime `bootstrap.py`: `46999B9E9357DC011D961E8E58764872D170854677B8E14118E96056FC9406DF`
- Package and installed Workflow marker sweeps found no B launcher, persistent Bootstrap, Python-worker lifecycle, or B profiler identifiers.
- No persistent managed-Python worker remained after installation.

## Diagnostic cleanup

- The bounded raw B evidence remains in this task directory.
- The live `%APPDATA%\Clackly\persistent-export-profile.jsonl` was moved to the Windows Recycle Bin after clean-A installation and is recoverable there.
- The live path is absent, preventing future samples from mixing with this experiment.

Clean A is now the installed product authority. The B arm passed its measured default performance and packaged recovery gates, but visual AE composition inspection was deferred. Any permanent B adoption belongs to a separate task.
