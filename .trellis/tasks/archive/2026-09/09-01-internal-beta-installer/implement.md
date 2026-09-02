# Implementation Plan

## 1. Lock context and contracts

- [x] Start the task only after the user explicitly approves this PRD/design/implementation plan.
- [x] Replace the example rows in `implement.jsonl` and `check.jsonl` with the curated packaging/Runtime/path-safety specs and this task's repository research before dispatch.
- [x] Load the relevant Trellis backend and cross-layer guidelines, then inventory the current package/install scripts and dirty worktree so unrelated changes are preserved.
- [x] Record the authoritative plugin id/version, qualified Windows/Resolve/Electron baseline, native module size/hash, exact ProgramData target, and `%APPDATA%\Clackly` non-ownership in focused tests before mutation logic.

## 2. Build the internal Beta artifact

- [x] Add the internal-Beta source/templates under one bounded scripts directory and a single build orchestrator.
- [x] Add `npm run beta:package` as `package:win -> package:verify -> Beta assembly`; do not duplicate renderer or managed Runtime staging.
- [x] Require package/manifest id and version agreement plus the pinned `WorkflowIntegration.node` identity.
- [x] Assemble only the owned version directory, copy the complete verified `win-unpacked`, generate sorted safe `SHA256SUMS.txt`, and re-verify exact inventory/hashes.
- [x] Create the versioned ZIP without a new tester-side dependency, extract it to a disposable directory, and compare inventory/hashes with pre-ZIP staging.
- [x] Add focused build tests for version/native mismatch, unsafe hash paths, Unicode filenames, owned-output containment, and ZIP identity.

## 3. Implement shared validation and transaction engine

- [x] Add Windows PowerShell 5.1-compatible shared functions for canonical containment, regular/reparse checks, hash inventory parsing, package layout/version/native/Runtime validation, installed-tree mapping, and stable exit results.
- [x] Keep production entry points fixed to the exact ProgramData plugin root; expose testability through module seams/direct function calls rather than production arbitrary-target or failure-injection switches.
- [x] Add Resolve process detection that fails closed when running/indeterminate and never terminates the process.
- [x] Implement same-parent staging and verification before target mutation.
- [x] Implement recognized-target backup, atomic rename activation, installed-tree verification, automatic restoration on activation/verification failure, and bounded cleanup behavior.
- [x] Support fresh install, same-version reinstall, older-to-newer upgrade, and newer-version downgrade refusal.
- [x] Reject files, foreign/corrupt directories, junctions, symlinks, and other reparse targets without recursive deletion.

## 4. Add one-click install and uninstall UX

- [x] Add `安装 Clackly.bat` and `卸载 Clackly.bat` as quoted thin wrappers with visible double-click feedback and exact exit-code propagation.
- [x] Implement preflight, UAC self-elevation/wait/exit propagation, and post-elevation revalidation in the PowerShell entry points.
- [x] Add idempotent uninstall: validate the exact recognized target, rename to a same-parent tombstone, delete only it, preserve all sibling plugins and `%APPDATA%\Clackly`, and report incomplete cleanup precisely.
- [x] Add plain-text README instructions for install, upgrade/reinstall, launch, uninstall, user-data preservation, supported baseline, unsigned-Beta prompts, integrity checking, and troubleshooting.
- [x] Test entry from spaces/Chinese/metacharacter paths, install/uninstall result text, and non-zero child propagation without touching the real host; the executable non-UAC probe uses the exact production argument builder and exit code 23.
- [ ] Deliberately cancel a real UAC prompt and confirm exit-code mapping. This destructive-interaction edge is not required before the already-administered internal Beta install, but remains a distribution acceptance gap.

## 5. Failure and safety qualification

- [x] Cover missing/changed/extra-authority-conflicting package files, malformed/duplicate/traversing/case-colliding hashes, reparse escapes, and staged/active hash drift.
- [x] Cover injected failures before backup, after backup, during activation, and during active verification; prove old-install restoration and absence of a partial active target.
- [x] Cover rollback failure and post-commit cleanup failure as distinct truthful outcomes.
- [x] Prove Resolve-running refusal happens before filesystem mutation and no code path invokes process termination.
- [x] Prove exact-target containment, sibling plugin preservation, and `%APPDATA%\Clackly` sentinel preservation for success and every failure path.
- [x] Prove uninstall absent-target success, recognized-target removal, unsafe-target refusal, and tombstone cleanup behavior.

## 6. Repository and package gates

- [x] Run focused Node/PowerShell tests and syntax/static checks for all new scripts.
- [x] Run `npm test` from `resolve-command-center`.
- [x] Run `npm run build`, `npm run package:win`, and `npm run package:verify`.
- [x] Run `npm run beta:package` from a clean owned Beta output and verify the extracted ZIP without Node/Python/network requirements on the consumer path.
- [x] Run `git diff --check` and review the final diff for unrelated product/UI/host changes, destructive path breadth, secrets, machine-specific paths, and accidental native-binary source tracking.
- [x] Run an independent review against PRD/design, with special attention to Windows quoting, reparse containment, swap/rollback, cleanup ambiguity, and source/package/installed identity.

## 7. Install and real Resolve acceptance

- [x] Confirm Resolve is closed; do not terminate it automatically.
- [x] Install the verified artifact through its own packaged PowerShell route before asking the user to test.
- [x] Read-only compare packaged and installed plugin/version/native/Runtime identities and confirm `%APPDATA%\Clackly` is unchanged.
- [x] Ask the user to restart Resolve and validate Workflow discovery, first/repeat Palette invocation, Settings, D7 Interaction Panel, and one non-destructive command on a local project.
- [x] After explicit uninstall-gate approval, run the shipped uninstaller, verify only the exact plugin target was removed and user data/sibling plugins remain, then reinstall the accepted artifact if ongoing testing requires Clackly present.

## 8. Finish

- [x] Record automated, package, installed-identity, and user manual acceptance evidence in the task without storing broad machine/user data.
- [x] Update a Trellis spec only for durable packaging/install contracts that future work must follow; do not rewrite unrelated Workflow/runtime authority.
- [x] Commit the bounded implementation and task evidence after acceptance (`fab140e`).
- [ ] Archive the completed task and append the developer journal.

## Rollback points

- Before target mutation: any package/hash/version/native/Runtime/process/path uncertainty fails closed and leaves the installed plugin untouched.
- During upgrade: any staging/activation/active-verification failure restores the recognized backup; a restoration failure is a separate critical result and must never be labeled success.
- After verified activation: cleanup-only failure keeps the verified active target, reports the retained task-owned path, and stops further risky swapping.
- During host acceptance: any package install, Workflow discovery, focus/window, Runtime, Settings, D7, or command regression stops distribution; close Resolve and reinstall the last accepted package through the same safe transaction.
- Uninstall failure never broadens deletion; retain/report the exact task-owned tombstone and preserve user data/sibling plugins.

## Automated evidence — 2026-09-01

- `node --test scripts/internal-beta.test.js`: 10/10 passing. It covers hash and inventory rejection, package/native identity drift, Unicode paths, ZIP extraction identity, fresh/reinstall/upgrade/downgrade, reparse/corrupt targets, rollback and cleanup outcomes, exact-target uninstall, and thin-wrapper contracts.
- The latest repair adds executable coverage for Windows-native UAC argument quoting from a path containing spaces, Chinese characters, `&`, and an apostrophe; both entry templates reach `-Elevated` and propagate a child exit code of 23 without requesting UAC. It also covers package/plugin ancestor junction refusal before transaction artifacts, unsafe nested package source refusal before owned-output cleanup, and complete retained-path reporting for cleanup and restore failures.
- `npm test`: 401 Node tests plus Python suites (6, 26, 21, 37, and 2 tests) all passing.
- `npm run build`, `npm run package:win`, and `npm run package:verify` passed; package verification confirmed managed CPython 3.13.14 x64.
- `npm run beta:package` passed. Its build step extracted the final ZIP to an ephemeral verification directory and compared inventory/hashes before returning success. The generated ZIP is `release/internal-beta/Clackly-Beta-0.1.0-win-x64.zip`, 143,503,982 bytes, SHA-256 `B7266827F85E82D300FA28D3C0DB2731D41ADE8B2B002295DFEC7FF14081B801`.
- Post-build package inspection found 5,425 hashed entries plus both BAT entry points and the Runtime manifest; `WorkflowIntegration.node` is 379,904 bytes / `C442DFD013DA2244F53BA8B36B9439CCCC197DF90B999D0074031C6D921B7B05`.
- Real ProgramData installation and installed-identity comparison passed on 2026-09-02; Resolve acceptance and real uninstaller acceptance remain unchecked and Lead-owned.

## Real installation evidence — 2026-09-02

- Preflight confirmed Resolve was closed, the current session was already elevated, the existing target was a normal directory, and ZIP SHA-256 remained `B7266827F85E82D300FA28D3C0DB2731D41ADE8B2B002295DFEC7FF14081B801`.
- The packaged `tools/Install-Clackly.ps1` completed with exit code 0 through Windows PowerShell 5.1. The installer reported a verified successful installation; it did not start or terminate Resolve.
- `%APPDATA%\Clackly` full-tree fingerprint was `58436A0EA3107B4D7CFE5B6E07766CDE5D5F26723C4DD1EE0D66ADAEFF2D3074` both before and after installation.
- Independent payload-to-ProgramData comparison mapped `resources/app` plus external `resources/runtimes` into the installed Workflow tree: expected 5,348 files, installed 5,348 files, zero missing/extra/path/size/SHA-256 mismatches.
- Installed identity is `com.wutpeach.clackly` version `0.1.0`; packaged and manifest versions agree. Installed `WorkflowIntegration.node` is 379,904 bytes with SHA-256 `C442DFD013DA2244F53BA8B36B9439CCCC197DF90B999D0074031C6D921B7B05`, and the installed Runtime manifest exists.
- No `.com.wutpeach.clackly.stage.*`, `.backup.*`, `.failed.*`, or uninstall transaction remnant remained under the Workflow Integration Plugins parent.
- The user accepted the installed Beta in Resolve on 2026-09-02: Workflow Integration launch, Palette behavior, Settings, D7 Interaction Panel, and the requested non-destructive local-project check had no observed issue.

## Real uninstall/reinstall evidence — 2026-09-02

- Resolve was closed and the user explicitly authorized the destructive uninstall gate.
- Packaged `tools/Uninstall-Clackly.ps1` returned exit code 0. The exact `com.wutpeach.clackly` target was absent afterward; `%APPDATA%\Clackly` and all sibling Workflow Integration plugin fingerprints were unchanged, and no task-owned tombstone/remnant remained.
- The same verified Beta package immediately reinstalled through packaged `tools/Install-Clackly.ps1` with exit code 0. The target returned as a normal directory; user data and sibling fingerprints remained unchanged, and no stage/backup/failed/tombstone remnant remained.
- Reinstalled `WorkflowIntegration.node` remained 379,904 bytes with SHA-256 `C442DFD013DA2244F53BA8B36B9439CCCC197DF90B999D0074031C6D921B7B05`.
