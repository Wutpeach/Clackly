# Diagnostic Candidate Qualification

## Automated verification

Qualified on 2026-08-29 before real-host sampling.

- Full `npm test`: 367 Node tests passed.
- Python suites: 6 bridge, 26 Resolve, 18 Script Runtime, 33 Resolve2AE core, and 3 wrapper tests passed.
- `npm run runtime:stage`, `npm run package:win`, and `npm run package:verify` passed.
- Package verification confirmed managed CPython 3.13.14 x64.
- `git diff --check` passed; only the active task and its temporary profiling candidate are dirty.
- The live `%APPDATA%\Clackly\export-to-ae-profile.jsonl` was absent before installation, so the next record set begins without stale samples.

## Installation gate

- A read-only process check found neither Resolve nor After Effects running.
- The packaged Workflow was installed in Copy mode at the standard local Workflow Integration path.
- The installation did not launch Resolve or After Effects.

## Identity verification

The source, packaged, and installed copies matched exactly:

| File | SHA-256 |
|---|---|
| `profiling/exportToAeProfile.js` | `AEB549BF6229F92012F28ED7796161AA31E5BBECB053BA369D73EB2893983447` |
| `script-runtime/python_runner.py` | `21681F3A89A4A8CE08EDA20944185F7F0FED1510F0A38B4B8B82F06C940A9728` |
| `resolve2ae_core/export.py` | `F30FCB0950E142569A1F7C2D67FC57FB9403625149F073F593B3220D72AA1E9D` |

## Remaining gate

The candidate now requires user-managed sampling in a local Resolve project. The diagnostic source remains temporary and must be removed after evidence capture, followed by a clean rebuild and reinstall.
