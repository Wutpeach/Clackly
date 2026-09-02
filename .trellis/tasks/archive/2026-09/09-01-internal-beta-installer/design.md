# Internal Beta Installer Design

## Design summary

Add a distribution layer after the existing verified Windows package. The build machine produces one versioned, self-contained ZIP; the tester extracts it and launches Chinese-named BAT entry points. Thin BAT wrappers invoke Windows PowerShell 5.1-compatible entry scripts, while a shared PowerShell transaction module owns validation, elevation, exact-path safety, installation, rollback, and uninstall.

The installer does not run Electron, Resolve, Node, npm, Python, or network downloads. It converts the verified `win-unpacked` payload into the existing Workflow plugin layout and changes only the fixed `com.wutpeach.clackly` target.

## Non-negotiable invariants

- Production target is exactly `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.wutpeach.clackly`.
- Resolve must be closed; the scripts never terminate it.
- A corrupt/unrecognized package fails before target mutation.
- A fresh install or upgrade never exposes a partially copied active target.
- A failed activation or installed-tree verification restores the previous normal-directory installation when one existed.
- `%APPDATA%\Clackly` is never read, moved, or deleted by install, upgrade, rollback, or default uninstall.
- The native module hash is pinned to the qualified internal Beta identity.
- No D6/D7, Settings, renderer, command, Runtime behavior, or host topology changes belong to this task.

## Source and output ownership

The implementation should keep distribution sources under a bounded `scripts/internal-beta/` area and use one build orchestrator under `scripts/`. The exact filenames may be adjusted during implementation, but ownership remains:

- build orchestrator: validates version/native identity, assembles a staging directory, emits hashes, verifies it, and creates the ZIP;
- two BAT templates: double-click UX and exit-code display only;
- `Install-Clackly.ps1` and `Uninstall-Clackly.ps1`: production entry points, package-root discovery, preflight, elevation, and messages;
- one shared PowerShell module: pure/path-aware validation and filesystem transaction operations reused by install and uninstall;
- `README.txt`: plain-text tester guide;
- Node tests: invoke PowerShell against disposable roots and small fixtures without touching ProgramData or requiring UAC.

Output is owned beneath `resolve-command-center/release/internal-beta/`:

```text
release/internal-beta/
├─ Clackly-Beta-0.1.0-win-x64/
└─ Clackly-Beta-0.1.0-win-x64.zip
```

The directory is the pre-ZIP verification surface. Rebuilding may replace only the resolved, task-owned version directory/ZIP after containment checks; it must not broadly clear `release` or `win-unpacked`.

## Build pipeline

`npm run beta:package` is a composed authority:

1. Run the existing `package:win` path so Runtime staging, renderer build, and Electron packaging remain unchanged.
2. Run the existing `package:verify` against the resulting `release/win-unpacked`.
3. Read the version from `package.json`, parse `manifest.xml`, and require exact plugin id/version agreement.
4. Require the qualified `WorkflowIntegration.node` size/hash.
5. Assemble top-level BAT/README/tools and copy the complete verified `win-unpacked` under `payload`.
6. Generate a UTF-8, path-sorted `SHA256SUMS.txt` for every regular distribution file except `SHA256SUMS.txt` itself. Paths are normalized relative paths; absolute, parent-traversing, duplicate, or case-colliding entries are invalid.
7. Independently re-read and verify the staged inventory and every hash.
8. Create the versioned ZIP with Windows' available archive support, then extract it to a disposable verification directory and require file inventory/hash identity with the pre-ZIP staging directory.

The internal hash list provides corruption/inventory detection, not publisher authenticity. This unsigned Beta does not claim that embedded hashes replace code signing.

## Artifact layout

The shipped logical layout is:

```text
Clackly-Beta-<version>-win-x64\
├─ 安装 Clackly.bat
├─ 卸载 Clackly.bat
├─ README.txt
├─ SHA256SUMS.txt
├─ tools\
│  ├─ Install-Clackly.ps1
│  ├─ Uninstall-Clackly.ps1
│  └─ ClacklyInstaller.psm1
└─ payload\
   └─ win-unpacked\
```

`win-unpacked` remains complete for artifact identity. The installed Workflow tree is intentionally different:

```text
com.wutpeach.clackly\
├─ <contents of payload\win-unpacked\resources\app>
└─ resources\runtimes\<contents of payload\win-unpacked\resources\runtimes>
```

This preserves the layout already consumed by the Resolve-owned Electron host and managed Runtime resolver.

## Entry, elevation, and process gate

The BAT files resolve all paths from `%~dp0`, quote them, invoke the matching entry script with `-NoProfile -ExecutionPolicy Bypass`, preserve its numeric exit code, print a concise Chinese result, and pause when launched interactively. They contain no copy/delete logic.

The PowerShell entry point performs package/path preflight before elevation, then relaunches the same fixed entry point with `RunAs`, waits for it, and propagates the elevated exit code. The elevated process repeats integrity and path validation to avoid trusting a pre-UAC check. Quoting must be verified with spaces, Chinese characters, and shell metacharacters; argument construction must not concatenate an executable command from untrusted path text.

Before mutation, the elevated process checks `Resolve.exe`. A running process produces a dedicated non-zero result and instructions to close Resolve manually. Missing access or an indeterminate process check fails closed. The installer never invokes `Stop-Process`.

## Package and target validation

Before staging, installation validates:

- distribution root containment and exact hash-list inventory;
- required BAT/tools/README/payload files;
- canonical package root and regular-file/regular-directory expectations, rejecting reparse/symlink escapes;
- plugin id and package/manifest semantic version agreement;
- native module exact size/hash;
- managed Runtime manifest and required packaged entry points;
- the fixed production plugin root and exact final target name.

An existing target is accepted only when it is a normal directory whose manifest identifies `com.wutpeach.clackly` and whose version parses. Files, junctions, symlinks, other reparse points, or unrecognized/corrupt directories are refused in Beta v1 rather than recursively removed. Same-version reinstall and older-to-newer upgrade are supported; accidental downgrade from a newer installed version is refused with an actionable message.

## Install transaction

All transaction directories live under the Workflow Integration Plugins parent so rename/swap operations remain on one volume:

1. Create a unique task-owned staging sibling such as `.com.wutpeach.clackly.stage.<guid>` after confirming nonexistence and containment.
2. Copy the packaged app contents into staging, then copy external runtimes into `stage\resources\runtimes`.
3. Verify the complete staged installed-tree inventory and file hashes against a deterministic mapping derived from the verified payload.
4. If a recognized existing target exists, rename it to a unique `.com.wutpeach.clackly.backup.<guid>`; do not delete it.
5. Rename the complete staging directory to the exact active target.
6. Re-verify plugin id/version, native module, Runtime, expected inventory, and hashes from the active target.
7. On activation or verification failure, move the failed candidate aside/remove only task-owned paths, rename the backup to the exact target, verify restoration, and return failure. A fresh-install failure leaves no target.
8. After verified commit, delete the old backup and any remaining task-owned staging. If cleanup alone fails, keep the verified active install, report the retained exact path and a non-zero partial-cleanup result; do not risk the active copy with a second swap.

Production code must not expose failure injection or arbitrary-target flags. Testable transaction functions receive filesystem/process seams or are invoked directly by tests with disposable roots; production entry points supply only the fixed ProgramData root.

## Uninstall transaction

The uninstaller shares elevation, Resolve-closed, exact-target, reparse, and plugin-identity checks.

- Missing target is an idempotent success.
- A recognized normal-directory target is renamed to a unique task-owned tombstone under the same parent before recursive deletion, so Resolve can no longer discover a partially deleted plugin.
- Successful deletion removes the tombstone and reports that user settings were preserved.
- A deletion failure returns non-zero and names only the retained task-owned tombstone; it does not expand deletion scope or touch sibling plugins.
- An unrecognized/reparse target is refused with manual diagnostic guidance.
- `%APPDATA%\Clackly` has no optional deletion switch in Beta v1.

## Error and user-message contract

Use stable exit categories for success, invalid/corrupt package, unsupported host/path, Resolve running, elevation cancelled/failed, unsafe existing target, staging/copy failure, activation/verification rollback, rollback failure, and cleanup failure. BAT output may translate these to concise Chinese text; PowerShell retains bounded detail sufficient for internal support.

Messages never claim success when rollback failed or cleanup is incomplete. They do not print user data, command payloads, or broad environment dumps. Successful install tells the tester to start Resolve and use `Workspace > Workflow Integrations > Clackly`; successful uninstall explicitly says settings were retained.

## Automated qualification

Tests must use disposable directories and fixture packages, not the real ProgramData target. Cover:

- authoritative version/id agreement and mismatch rejection;
- native module/hash/inventory validation, including missing, modified, duplicate, absolute, traversal, case-collision, and reparse entries;
- full payload-to-installed-tree mapping, including external runtimes;
- fresh install, same-version reinstall, older-version upgrade, newer-version downgrade refusal, and idempotent uninstall;
- recognized normal target versus file/junction/symlink/corrupt/foreign target;
- failure before backup, after backup, during activation, and during active verification, including exact restoration and no partial active tree;
- Resolve-running and indeterminate-process refusal before mutation;
- installer/uninstaller exact-target containment and sibling preservation;
- `%APPDATA%\Clackly` sentinel preservation on every path;
- BAT/PowerShell invocation and exit propagation from paths containing spaces and Chinese characters;
- build staging, hash generation, ZIP extraction/inventory identity, and owned-output cleanup containment.

Run focused tests first, then the repository test suite, build/package verification, Beta package assembly, extracted artifact verification, and `git diff --check`.

## Real-host rollout and rollback

1. Build the artifact from the current source and retain the ZIP/hash/version evidence.
2. Confirm Resolve is closed; install using the artifact's own BAT/PowerShell route, not the developer copy installer.
3. Read-only verify source/package/installed identities and confirm user-data preservation.
4. Ask the user to restart Resolve and manually accept Workflow discovery, Palette invocation, Settings, D7, and one non-destructive command on a local project.
5. Exercise the shipped uninstaller only after preserving the accepted install artifact and with explicit awareness that Clackly will be removed; reinstall the same artifact afterward if continued testing is needed.

Before public release, reverting the task is a normal removal of the new distribution scripts/tests/package command. For a failed Beta candidate, close Resolve and reinstall the last accepted artifact or restore through the install transaction. Never recover by deleting the broad Workflow Integration Plugins directory or user data.

## Rejected alternatives

- Requiring every tester to locate Developer Examples: not self-contained and adds avoidable version/path variance.
- Reusing the current delete-then-copy developer installer unchanged: cannot satisfy failure rollback or partial-copy safety.
- Installing the entire `win-unpacked` directory as the Workflow plugin: wrong Resolve plugin layout and duplicates unrelated Electron launcher files.
- MSI/MSIX/NSIS/Inno Setup for this phase: unnecessary surface area for a controlled internal Beta.
- Network bootstrap or dependency installation: violates the offline/no-tool tester contract.
- Deleting `%APPDATA%\Clackly` during uninstall: violates the chosen preserve-user-data behavior.
