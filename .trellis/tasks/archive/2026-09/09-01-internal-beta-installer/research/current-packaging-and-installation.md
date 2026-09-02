# Current packaging and installation evidence

## Existing build path

- `resolve-command-center/package.json` version is `0.1.0`; `manifest.xml` declares the same plugin version and `com.wutpeach.clackly` id.
- `npm run package:win` stages the managed CPython runtime, builds the renderer, and runs Electron Builder's Windows directory target into `release/win-unpacked`.
- The packaged application is at `release/win-unpacked/resources/app`; the external managed runtime is at `release/win-unpacked/resources/runtimes`.
- `npm run package:verify` verifies the managed runtime lock/manifest, current-source/staging/package source identity, exact runtime inventory, the single packaged interpreter, absence of `app.asar`, required Workflow files, and real execution under hostile parent Python environment variables.
- `verify-package.js` already requires `workflow-plugin/WorkflowIntegration.node`, but it does not currently pin that native file's approved Beta hash or assemble a distributable ZIP.

## Existing developer/package installer

- `scripts/install-workflow-plugin.ps1` supports source junction installs and package copy installs.
- A package copy installs `resources/app` at the Workflow plugin target, then copies `resources/runtimes` into `<plugin>/resources/runtimes`. It does not install the entire Electron `win-unpacked` root as the Workflow plugin.
- Its replacement path removes an existing copy target before copying the new application tree. A file lock, copy failure, or interrupted process can therefore leave no working installation or a partial installation.
- That script also accepts arbitrary roots for developer/test use and copies the native module from local Developer Examples for source installs. Those behaviors should remain developer-only rather than becoming the internal Beta's user contract.

## Native module identity

- The authorized internal Beta package directly bundles `WorkflowIntegration.node`; distribution permission is not a planning blocker.
- The qualified file is 379,904 bytes with SHA-256 `C442DFD013DA2244F53BA8B36B9439CCCC197DF90B999D0074031C6D921B7B05`.
- Previously inspected official example, source/package, and installed copies matched that identity. The Beta builder must fail if its package candidate does not.

## Consequences for the task

- Reuse `package:win` and `package:verify`; add distribution assembly after those gates.
- Keep the complete `win-unpacked` tree in the portable payload so the artifact is self-contained, but transform only `resources/app` plus `resources/runtimes` into the active Workflow plugin tree during installation.
- Build a separate end-user transaction engine with same-volume staging, backup, activation, verification, and rollback. Do not weaken or silently change the developer junction workflow.
- Preserve `%APPDATA%\Clackly`; the current package installer does not own that data and neither the Beta installer nor uninstaller should start owning it.
