# B Diagnostic Package Qualification

Qualified on 2026-08-30 before real-host sampling.

## Automated and package gates

- Lead focused regression: 19 Node tests and 6 persistent-Bootstrap Python tests passed.
- Developer Orca Worker full qualification: 389 Node tests and Python suites 6 + 26 + 21 + 32 + 2 passed; production build passed.
- `npm run runtime:stage`, `npm run package:win`, and `npm run package:verify` passed.
- Resolve and After Effects were not running before installation.
- `npm run workflow:install:package` installed the Copy-mode Workflow at the standard machine-wide Resolve Workflow Integration path.
- `%APPDATA%\Clackly\persistent-export-profile.jsonl` was absent before and after installation.
- No Clackly managed-Python or `persistent_bootstrap.py` process remained after installation.

## Identity

Source, staged/package, and installed copies matched exactly:

- `persistent_bootstrap.py`: `6D56C3330042082C00FEEB33D253363CBAE579A82CF994DB3FF43201E7DAC03A`
- `persistent.js`: `5C23C387EC52837D44106DBEA944C3F4C0DA40DE9724AA43E547CA5E6B3AA7A3`

The installed package is the temporary B diagnostic candidate. It still requires local Resolve/AE performance, output-parity, timeout-recovery, and same-version Resolve-restart acceptance. Clean A restoration remains mandatory after evidence capture.
