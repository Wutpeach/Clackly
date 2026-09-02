# Build self-contained internal Beta installer

## Goal

Produce a self-contained Windows x64 ZIP that an internal tester can extract and install with one BAT file, without installing developer tools or locating DaVinci Resolve's Developer Examples. The package is for controlled internal Beta distribution, not a public or signed release.

## Product context

- Clackly is a DaVinci Resolve Workflow Integration plugin.
- The qualified baseline is DaVinci Resolve Studio 20.3.2.9 on Windows x64 with the bundled Electron 36.3.2 runtime.
- The repository package version and Workflow manifest version are currently `0.1.0`.
- Internal Beta distribution is explicitly allowed to bundle the verified `WorkflowIntegration.node`; redistribution permission is not a blocker for this task.
- The verified native module identity is SHA-256 `C442DFD013DA2244F53BA8B36B9439CCCC197DF90B999D0074031C6D921B7B05`.

## User-visible artifact

The build produces one versioned ZIP with this logical layout:

```text
Clackly-Beta-<version>-win-x64\
├─ 安装 Clackly.bat
├─ 卸载 Clackly.bat
├─ README.txt
├─ SHA256SUMS.txt
├─ tools\
│  ├─ Install-Clackly.ps1
│  └─ Uninstall-Clackly.ps1
└─ payload\
   └─ win-unpacked\
```

The ZIP is portable after it is built: the tester needs only the extracted directory and a supported Resolve installation.

## Requirements

### Build and package

- Add one supported build entry, provisionally `npm run beta:package`, that starts from the existing Windows package flow rather than maintaining a second application build.
- Build the renderer and stage the managed CPython runtime through the current packaging path.
- Run the existing packaged-runtime verification before assembling the Beta artifact.
- Include the complete `release/win-unpacked` tree under `payload`, including the verified `workflow-plugin/WorkflowIntegration.node` and `resources/runtimes` tree.
- Derive the artifact version from the existing package/manifest version authority and fail when those version sources disagree.
- Generate `SHA256SUMS.txt` from the final distributable contents and verify it during the build. The installer must verify the files it relies on before mutating the installed plugin.
- Create a deterministic, clearly named ZIP under a release output location without requiring manual file selection or post-build copying.
- Do not require Node.js, npm, Python, Resolve Developer Examples, or network access on the tester's machine.

### One-click BAT experience

- `安装 Clackly.bat` is a thin bootstrap around the PowerShell installer; installation logic must not be duplicated in BAT.
- The BAT must work when the extracted directory contains spaces or Chinese characters.
- The BAT must self-elevate when required, preserve the PowerShell exit code, and leave a visible success or actionable failure message for a tester launching it by double-click.
- The installer must require DaVinci Resolve to be closed before changing the plugin. It must not terminate Resolve automatically.
- The success message tells the tester to start Resolve and open `Workspace > Workflow Integrations > Clackly`.

### Installation safety

- Install only to:

  ```text
  %PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\
  Workflow Integration Plugins\com.wutpeach.clackly
  ```

- Validate the package structure, version, hashes, required entry points, managed runtime manifest, and bundled native module before modifying the target.
- Copy to a same-volume staging directory first. Never expose a partially copied active plugin directory.
- If an existing Clackly installation is present, move it to a uniquely named backup before activating the staged copy.
- Activate the new copy only after staging validation passes. If activation or post-install verification fails, restore the previous installation automatically and return a non-zero exit code.
- A successful installation removes only task-owned transient staging/backup material after the installed copy has been verified.
- Reinstalling the same version and upgrading from an older internal Beta must be defined, repeatable operations rather than an unconditional delete-then-copy.
- Refuse to replace an unexpected junction, reparse point, file, or path outside the exact Clackly plugin target without an explicit and test-backed policy.
- Keep settings and user data under `%APPDATA%\Clackly` untouched during install, upgrade, rollback, and default uninstall.

### Uninstall scope

- If uninstall is included in Beta v1, `卸载 Clackly.bat` must use the same elevation, path-safety, Resolve-closed, exit-code, and double-click feedback rules as installation.
- Default uninstall removes only the exact `com.wutpeach.clackly` plugin directory and installer-owned transient data; it preserves `%APPDATA%\Clackly`.
- The uninstaller must not delete sibling Workflow Integration plugins or broad Resolve support directories.

### Documentation

- `README.txt` must be readable without Markdown tooling and cover supported host/OS, installation, upgrade/reinstall, uninstall availability, how to launch Clackly, preservation of user data, troubleshooting, version, and package hash verification.
- State clearly that this is an unsigned internal Beta. Windows security prompts or reputation warnings must be described without encouraging users to disable system-wide security controls.

## Acceptance criteria

- [ ] One documented repository command builds and verifies `Clackly-Beta-0.1.0-win-x64.zip` (or the current authoritative version) from a clean package output.
- [ ] The ZIP contains the documented top-level files, complete `win-unpacked` payload, managed CPython runtime, and verified `WorkflowIntegration.node`.
- [ ] Artifact and payload verification fail before installation on a missing, extra-authority-conflicting, or hash-mismatched required file.
- [ ] A tester with Resolve installed but without Node.js, npm, Python, Developer Examples, or network access can install by extracting the ZIP and double-clicking the BAT.
- [ ] Installation succeeds from a path containing both spaces and Chinese characters.
- [ ] Non-elevated invocation obtains only the elevation required for the ProgramData target and reports the final elevated process result.
- [ ] Installation refuses to proceed while Resolve is running and leaves the existing plugin untouched.
- [ ] Fresh install, same-version reinstall, and upgrade from a fixture representing an older Beta all leave one complete normal-directory plugin at the exact target.
- [ ] Injected failures before activation leave the old install untouched; injected failures during or after activation restore the old install and return failure.
- [ ] Installed application and runtime inventories/hashes match the verified payload, including the native module hash.
- [ ] No install, upgrade, rollback, or default uninstall path changes `%APPDATA%\Clackly`.
- [ ] The v1 uninstaller removes only the exact Clackly plugin target, preserves user data, and is idempotent.
- [ ] Automated tests cover path quoting, version/hash rejection, Resolve-running refusal, staging, backup, rollback, reinstall/upgrade, exact-target deletion, and exit-code propagation.
- [ ] Existing application tests, Windows package build, package verification, and `git diff --check` pass.
- [ ] The built Beta package is installed through its own BAT/PowerShell path before the user is asked to test Resolve.
- [ ] After installation, manual acceptance on a local Resolve project confirms Workflow discovery, Palette invocation, Settings, D7 Interaction Panel, and at least one non-destructive command; no network project is used unless explicitly requested.

## Out of scope

- Public release, website/CDN distribution, auto-update, telemetry, release channels, or a marketplace.
- MSI/MSIX/Inno Setup/NSIS packaging, Start-menu shortcuts, registry registration, or system PATH changes.
- Code signing, EV certificates, or suppressing Windows reputation prompts.
- macOS or Linux packages.
- Installing DaVinci Resolve or changing Resolve configuration outside the exact Workflow Integration plugin target.
- Downloading dependencies on the tester's machine.
- Solving the paused first-show blue DWM border issue.

## Product decisions

- Beta v1 includes `卸载 Clackly.bat` and its PowerShell implementation.
- Default uninstall removes only the exact Workflow Integration plugin target and preserves `%APPDATA%\Clackly` user data.
- Upgrade rollback remains part of installation and is independent of the standalone uninstaller.

## Repository constraints and reuse

- Reuse `package:win` and `package:verify`; do not fork the renderer, Electron, or managed-runtime build.
- The current `scripts/install-workflow-plugin.ps1` is suitable for developer junction/copy installs but removes an existing Copy target before copying. Do not expose that non-atomic behavior as the Beta installer.
- Keep developer installation commands working unless the design explicitly factors shared validation helpers without weakening either workflow.
- The Beta installer owns distribution/install orchestration only; it must not change Palette, Settings, D6/D7 native-window lifecycle, renderer behavior, Resolve commands, or user-data schemas.
