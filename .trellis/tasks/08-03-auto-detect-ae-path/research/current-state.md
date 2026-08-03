# After Effects Path Auto-Discovery — Current-State Research

## Finding

The feature is small if it stays a feature-owned startup initializer. Clackly already owns the shared configuration file, capability-scoped reads/writes, Settings projection, required-field status, and command-time config injection. The missing behavior is only: when each Electron host becomes ready, validate `ae.export.aePath`, discover a Windows `AfterFX.exe` when needed, and save the candidate through `ConfigManager` before windows and IPC are exposed.

Do not add a global AE service, new Settings IPC, renderer state, Script Runtime discovery method, or dependency for one consumer.

## Repository Evidence

- Both hosts build the same registry/config/status/command stack and share `ConfigStorage.fromAppData(app.getPath("appData"))`: `resolve-command-center/electron/main/main.js:37-55` and `resolve-command-center/workflow-plugin/main.js:118-136`.
- Standalone UI creation begins in `app.whenReady()` at `electron/main/main.js:139`; Workflow Integration does the same at `workflow-plugin/main.js:257`. These are the two composition points that must invoke one shared initializer before palette creation and IPC registration.
- `ConfigManager.update()` reloads and preserves the rest of the capability configuration, while `save()` can persist an intentionally partial non-UI configuration. `get()` reloads current values, so Settings sees host-written changes without a new API: `config/ConfigManager.js:44-107`.
- Settings already loads `api.getConfig(selectedId)` whenever a Feature is selected and passes the values to the generic path input: `electron/renderer/SettingsApp.jsx:86-111`, `SettingsRenderer.jsx:35-63`.
- Feature status checks required configuration before any optional availability probe: `feature-status/FeatureStatusManager.js:90-106`. Keeping `aePath.required: true` preserves the correct missing-config recovery when discovery fails.
- Command execution calls `configManager.assertConfigured()` and then passes only `configManager.forCapability()` to the Capability: `command-engine/executor.js:31-37`.
- The current wrapper requires a configured existing file before invoking Resolve2AE: `scripts/resolve2ae_export.py:20-23`.
- The copied core already has `get_running_ae_path()` for Windows PowerShell/WMIC process lookup, but only uses it as a boolean at send time and still launches the configured `ae_path`: `resolve2ae_core/export.py:60-91`, `1013-1037`.
- The backend spec requires capabilities to remain scoped, ConfigStorage to own filesystem persistence, and Settings/Command Engine to stay generic: `.trellis/spec/backend/quality-guidelines.md` under “Capability Configuration” and “Script Capability Runtime”.

## Local Windows Evidence

On the development machine, all three intended strategies resolved the same file:

```text
C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\AfterFX.exe
```

- running process: `Get-Process AfterFX ... Path`;
- registered application: `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\AfterFX.exe` default value;
- standard directory: `Program Files\Adobe\Adobe After Effects 2026\Support Files\AfterFX.exe`.

Python `winreg` also read the App Paths value successfully and `Path.is_file()` returned true. `AfterFX.exe` was not on PATH. The Adobe uninstall record exposed only the broad `C:\Program Files\Adobe` install root, so uninstall metadata is weaker than App Paths and is unnecessary.

## Minimal Boundary

Add one host-side feature module such as `capability/afterEffectsPath.js` and its test. The module owns Windows process/registry/standard-directory discovery plus a small initializer that accepts `ConfigManager`. Both hosts call it at readiness. Existing Settings, IPC, manifests, Python wrapper, and core remain unchanged except documentation.

Recommended precedence:

1. valid saved manual/previous path;
2. running AfterFX process path;
3. HKCU/HKLM App Paths value;
4. standard Adobe directories, highest numeric version.

If a stale saved value cannot be replaced, persist the remaining `ae.export` values without `aePath` so FeatureStatus reports missing configuration accurately; do not save an empty string or guessed path.

## Affected Files

- add `resolve-command-center/capability/afterEffectsPath.js`;
- add `resolve-command-center/capability/afterEffectsPath.test.js`;
- update `resolve-command-center/electron/main/main.js`;
- update `resolve-command-center/workflow-plugin/main.js`;
- update `resolve-command-center/README.md`;
- update backend spec only if implementation establishes a reusable startup/config contract beyond the current documented behavior.

## Risks and Checks

- Windows command output and registry parsing must tolerate missing tools/keys and continue to later strategies.
- Numeric version comparison must not use lexical folder ordering.
- A valid saved path must short-circuit all discovery and writes, preserving a manual version selection.
- Both host calls must occur before UI/IPC can observe Feature status.
- Persist only through ConfigManager and preserve `prefix`, unrelated Features, and the existing last-writer-wins cross-process contract.

Validation:

```powershell
node --test capability/afterEffectsPath.test.js config/*.test.js feature-status/*.test.js feature-ui/*.test.js electron/main/*.test.js
python -m unittest discover -s scripts -p "test_*.py"
npm test
npm run build
git diff --check
```
