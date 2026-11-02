# Clackly Inno Setup

The user-facing Windows asset is `Clackly-Setup-<version>-win-x64.exe`. It embeds the complete application, built renderer and managed Python Runtime. It contains no Blackmagic Native binary and needs no application download during installation. Native is copied from the user's official local Resolve SamplePlugin after cache-only signature/publisher/x64 checks.

From the application root, build from a clean committed checkout:

```powershell
npm ci
npm run package:win
npm run package:verify
node scripts/workflow-release/package.js --nonpublishable
npm run setup:build -- -Archive release/workflow/Clackly-Workflow-<version>-win-x64.zip
```

Build requires Node, Windows PowerShell 5.1 and Inno Setup **6.7.1** (`C:/Program Files (x86)/Inno Setup 6/ISCC.exe`). `Build.ps1` also accepts `-Compiler` and a fresh `-Output` directory. The default output is `release/setup`; existing outputs are refused to preserve evidence.

Package/lock/XML version, exact ZIP filename, complete inventory/hash/Runtime/native exclusion and source commit are checked before compilation. Input must come from the same clean source commit. Local untagged builds retain `publishable=false`, actual commit and `source.workflowPath=null`; they are review candidates, not canonical Release artifacts. The canonical tag workflow builds publishable payloads using the existing exact-tag/source gates. Do not rename a dirty/local artifact into a formal release.

The version is passed to Inno metadata, asset filename and the installed helper from package.json. `build-report.json` records source identity, input ZIP SHA-256, final EXE size/SHA-256, compiler version and unsigned status. The ZIP and extracted payload are build intermediates; only the complete EXE is the primary download.

Inno owns the wizard, UAC, deployment, uninstaller and completion result. The helper only checks host exit, fixed paths, official local Native and optional installed inventory (`-Mode Verify -ExpectedVersion <version> -Work <native-work-directory> -Report <file>`). Verify is a separate read-only acceptance command, not a post-install rollback hook.

The fixed target is the Resolve ProgramData Workflow plugin directory. An existing recognized Clackly program tree moves to one temporary previous directory before replacement. Failed installs attempt restoration; successful installs remove that temporary tree. User AppData, shared permissions, unrelated plugins and R29 records are preserved. The installer/uninstaller require the user to close Resolve/Workflow and never close or restart them automatically.

R20-R29 installers remain historical code, outside the new Settings/Inno execution chain. Their retained PowerShell files are not used by the Inno path. Actual install, UAC or uninstall still requires the user's onsite approval. Offline installation, standard-user UAC and real uninstall remain unverified until explicitly exercised.
