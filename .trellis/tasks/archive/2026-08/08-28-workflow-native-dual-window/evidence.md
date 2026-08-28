# Automated evidence — 2026-08-28

## Contract verified

- `paletteHostPolicy.js` selects the same immutable opaque D6/D7 policy for Windows standalone and Workflow, regardless of renderer URL or packaged state. Non-Windows selects the transparent attached fallback.
- The Windows main is a `240x320` opaque `#151619` frameless window with native corners/frame shadow and no base shape. The renderer receives a neutral full-bleed surface marker.
- The detached Panel is a persistent opaque `260px` native window separated by a physical `16px` gap. It is `focusable:false` only at construction, begins `show:true`/opacity `0`, and uses only opacity/mouse state after that.
- Browser preview imports the canonical geometry contract, shares the visual style projection and Panel content, and remains an explicitly hostless DOM simulation.

## Automated gate

- Focused main/renderer policy and lifecycle suite: `71/71` pass.
- Full suite: `npm test` passed (`303` Node tests plus all five Python discovery suites).
- Syntax checks passed for changed main, Workflow, preload, and renderer modules.
- `npm run build` passed with Vite 8.1.5.
- `npm run package:win` passed and produced `release/win-unpacked`; no package was installed.
- `npm run package:verify` passed and verified packaged CPython 3.13.14 x64 at `release/win-unpacked/resources/runtimes/python/cpython-3.13.14/win32-x64/python.exe`.
- Scoped `git diff --check` passed for task-owned implementation paths. The repository-wide check still reports two pre-existing blank-line findings under unrelated `.agents` and `.claude` Impeccable work, which were not modified.

## Headless browser evidence

- Command: `node scripts/palette-evidence.mjs --renderer built --scenario browser-preview --output ..\\.trellis\\tasks\\08-28-workflow-native-dual-window\\evidence\\palette-preview`
- Result: passed in headless Microsoft Edge 151.0.4129.107 using Playwright 1.62.1.
- The headless run captured closed/open and small-viewport screenshots for review; binary screenshots are intentionally not retained in the task archive, while the assertions and summary below remain the durable evidence.
- The flow verified the closed and open root preview contracts, shared `240x320` main / `260px` Panel / `16px` gap / `60–180px` panel bounds, shared radii/surface/shadow stage, Info/Tab/Escape lifecycle, hostless presentation authority, and safe-edge scrolling at `220x280`.
- This is DOM visual evidence only. It does not establish DWM, HWND separation, native focus, hit testing, z-order, packaged runtime behavior, or Resolve acceptance.

## Source Workflow installation

- Authorization covered replacement of exactly `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.wutpeach.clackly` after read-only verification showed it was that exact normal directory, not a junction.
- Command: `powershell -ExecutionPolicy Bypass -File scripts/install-workflow-plugin.ps1 -Mode Copy` from `resolve-command-center/`.
- Result: passed. The supported installer copied the Resolve-provided `WorkflowIntegration.node` into source, removed/replaced only the authorized existing plugin directory, and copied the current source app into that target. No packaged distribution was installed and no Electron or Resolve host was launched.
- Read-only verification: the installed target is a normal directory last written on `2026-08-28 19:02:07`; `manifest.xml`, `package.json`, `dist/renderer/index.html`, `workflow-plugin/main.js`, `workflow-plugin/WorkflowIntegration.node`, `electron/main/paletteHostPolicy.js`, `electron/main/nativeDualWindowHost.js`, and `electron/shared/palette-geometry.json` all exist and each SHA-256 matches the verified source tree.
- Recoverability: the prior copied plugin directory was permanently replaced by the supported installer; it was not backed up. Recovery is to reinstall a chosen source revision with the same supported installer (or restore a separately saved plugin copy).

## Manual source Workflow acceptance

- After a full DaVinci Resolve restart, the user manually tested the installed source Workflow plugin and reported: `效果不错，提交并且归档任务吧`.
- This accepts the current Windows source Workflow D6/D7 integration: stable Palette reveal/hide, native rounded corners/shadow, and detached Interaction Panel behavior in the Resolve host.
- Scope remains deliberately narrow: this is not packaged-distribution installation or packaged Resolve acceptance. No Electron or Resolve host was launched as part of automation after the install.
