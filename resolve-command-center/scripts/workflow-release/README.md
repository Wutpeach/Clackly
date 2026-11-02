# Windows Inno EXE release

The primary release asset is **`Clackly-Setup-<version>-win-x64.exe`**. It contains the complete Clackly application, built renderer and hash-locked managed Python Runtime. `WorkflowIntegration.node` is excluded and provisioned only from the user's verified official local Resolve installation. No standalone Electron or local SDK/evidence is distributed.

## Build and provenance

Use the [Inno build entry](../inno-setup/README.md). The existing Workflow ZIP builder remains an intermediate packaging/verification step; it is not the new user-facing release format. It validates production-only contents, dependency locks, current Settings/Inno source bytes, Runtime provenance and exact file inventory/size/SHA-256. Schema-v2 `clackly-release.json` retains the source repository, commit, tag intent, workflow/run identity, publication qualification and local-native policy.

Local preparation requires a clean committed checkout and uses `--nonpublishable`. These EXEs are unsigned review candidates. Canonical release payloads require a clean exact `v<package.json version>` tag and `.github/workflows/workflow-release.yml` at that tag; a local or main/PR build does not qualify. Never reuse or rename the R31 dirty/local onsite overlay builds as formal assets.

## Existing users

**v0.1.3 and earlier:** download the new EXE manually from the official GitHub Release and run it once. Close Resolve yourself when prompted, finish installation, then reopen Resolve. Your settings remain in AppData. The old ZIP-based Settings updater is not guaranteed to install an EXE-only release. After this one-time installation, use the new Settings updater for later EXE releases.

New Settings accepts only the exact complete EXE from `Wutpeach/Clackly`, a stable newer version, the official GitHub URL, uploaded asset identity/size and GitHub API `sha256:` digest. It verifies downloaded bytes and asks the user to start installation. Windows owns the independent installer/UAC lifetime; “handed off” does not claim installation completed. There is no ZIP fallback or missing-digest bypass.

## CI and approval

The existing tag workflow builds and verifies the application/Runtime ZIP, compiles with pinned Inno 6.7.1, and uploads one complete EXE plus a separate build-evidence artifact. Its default-disabled `CLACKLY_ENABLE_DRAFT_RELEASE` gate is retained: when separately authorized it creates an unpublished draft, never an automatic public release. Main/PR ZIP artifacts remain development intermediates.

Public publication requires explicit approval of the version, source/tag, unsigned publisher/SmartScreen risk (or a separate signing plan), and onsite acceptance arrangements. The report SHA-256 describes the unsigned bytes; signing would change those bytes and requires a fresh final digest.

After approved publication, check the real GitHub API tag, exact EXE name/size/URL and `sha256:` digest against the final asset, then perform one real discovery/download/hash check. Do not substitute local metadata/cache simulations for this evidence. Onsite UAC/overwrite/uninstall or changes to a test machine require separate confirmation. Actual offline install, standard-user UAC and real uninstall remain unverified unless performed.

The R31 test machine currently has unpublished local **0.1.4**. The proposed next public version is **0.1.5**, skipping public 0.1.4 so this machine can discover a genuinely newer approved release without rollback. This is a proposal until publication approval; do not change the installed test machine to manufacture an update.
