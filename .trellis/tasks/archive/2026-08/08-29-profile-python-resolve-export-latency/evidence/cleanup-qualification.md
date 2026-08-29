# Clean Workflow Restoration

## Source cleanup

- The Orca `developer` Worker restored all 11 tracked product/test files to exact `HEAD` content and removed the temporary `resolve-command-center/profiling/` directory.
- Clean-source `npm test` passed: 365 Node tests and Python suites of 6, 26, 15, 32, and 2 tests.
- Node syntax checks, Python compilation, `git diff --check`, and product/spec marker searches passed.
- Product source has zero diff from `HEAD`; only this active task directory remains untracked.
- No lasting spec update is appropriate because the profiling mechanism was deliberately temporary. The reusable conclusions and architectural experiment gates are retained in `evidence/analysis.md`, not promoted into the product contract.

## Clean package and install

- Resolve and After Effects were confirmed closed before the clean install.
- `runtime:stage`, `package:win`, and `package:verify` passed for the clean source.
- The clean packaged and installed Workflow contain no `export-to-ae-profile`, `CLACKLY_EXPORT_PROFILE`, `__clacklyExportToAeProfile`, or profiler-module markers.
- Source, package, and installed copies matched:

| File | SHA-256 |
|---|---|
| `capability/afterEffectsLaunch.js` | `675078BA8AC6E5EC099B75FDAEECE7D76A59486040E4F6B011C268EC402B0949` |
| `script-runtime/python_runner.py` | `C8BDDF0D093414D8BFE9E7D8952AFB8CF5C80D96F5A3E7E6133A654B92C1E67E` |
| `resolve2ae_core/export.py` | `083177F0783588DFEB5C47E8CAC5B973328781701E70A158A445044CE8488116` |

## Evidence cleanup

- The live AppData JSONL matched the retained evidence SHA-256 `B172838ED289082A72CB4FE08392E109DFF99CB2FE5327BBF5598610223D5047`.
- The live JSONL was moved to the Windows Recycle Bin after the clean Workflow installation.
- The bounded task evidence copy remains at `evidence/export-to-ae-profile-raw.jsonl`.
