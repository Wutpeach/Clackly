# Package and install qualification

Date: 2026-08-30

## Preconditions and scope

- Read-only checks found no Resolve, Workflow host, After Effects, Clackly, or Electron process before replacement.
- This qualification did not launch, close, focus, or automate Resolve or After Effects, and did not open or modify a project or project library.
- Source hygiene passed: `git diff --check`; source metadata and wrapper contain exactly the three current Export-to-AE ids; temporary profiling/B-experiment markers are absent from product source.

## Commands and results

| Command | Result |
| --- | --- |
| `npm run runtime:stage` | Passed; staged locked managed CPython 3.13.14 x64. |
| `npm run package:win` | Passed; freshly rebuilt the Windows unpacked package. |
| `npm run package:verify` | Passed; exact staged/package Runtime inventory and hashes plus hostile-environment Runtime execution passed. |
| `npm run workflow:install:package` | Passed; copied the verified package to the machine-wide Resolve Workflow Integration Copy target. |

## Identity and installed content

- `persistent_bootstrap.py` is byte-identical across source, staging, package, and installed Runtime (SHA-256 prefix `26A0976201E3ABCA`).
- `scripts/resolve2ae_export.py` is byte-identical across source, staging, package, and installed Runtime (SHA-256 prefix `66EFD9C9D68748C2`).
- Packaged and installed copies of RuntimeManager, PersistentScriptLauncher, Core, standalone host, Workflow host, and Export-to-AE command metadata are byte-identical.
- The package and installed Runtime have the same 51-file inventory with matching SHA-256 for every Runtime file.
- Installed command metadata contains exactly `timeline.exportToAfterEffects`, `timeline.exportAudioToAfterEffects`, and `timeline.exportVideoToAfterEffects`; the installed wrapper contains no retired Command id.
- Both installed Electron hosts contain independent Python and PowerShell prewarm/disposal lifecycle wiring.
- Installed product search found no temporary profiler or B-experiment diagnostic marker.

## Child-process check

- No installed persistent-Python or PowerShell-probe orphan is running, and no target host process appeared after installation.
- A concurrent Node test-runner ancestor owned 11 PowerShell probe-helper children; these are not installed-host children and were not modified.

## Remaining acceptance

The installed package is ready for the user to restart Resolve, load Clackly from the Workflow Integrations menu, then run the separate local-project/AE acceptance sequence. Performance, visual composition inspection, and installed recovery remain unverified.
