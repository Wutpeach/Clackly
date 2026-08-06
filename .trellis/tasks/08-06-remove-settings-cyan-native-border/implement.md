# Implementation Plan: Transparent Settings Native Surface

## Phase A: minimal product change (DONE)

1. Change the Settings BrowserWindow options in `electron/main/window.js`:
   - add `transparent: true`;
   - change `backgroundColor: "#101216"` to `backgroundColor: "#00000000"`.
2. Restore `openSettingsWindow(window, featureId)` to its pre-DWM shared signature and behavior (create on demand, restore/show/focus, select feature, return the singleton).
3. Delete all DWM/trace machinery: `suppressSettingsBorder.js`, `suppressSettingsBorder.test.js`, `suppress_settings_border.py`, `borderTrace.js`, `borderTrace.test.js`, `probe_settings_border.py`, their `window.js` imports/calls/injection, and the package verification assertions in `scripts/verify-package.js`.
4. Update the Settings BrowserWindow contract test to assert `transparent: true` and `backgroundColor: "#00000000"`; keep all geometry/normal-behavior and palette-parity assertions.

## Phase B: automated validation (DONE — all passed)

Command log (2026-08-06):

- `node --test electron/main/window.test.js`: 18/18 pass.
- `node --test electron/main/window.test.js electron/renderer/model.test.mjs`: 27/27 pass.
- `npm test`: 168/168 Node pass + all Python unittest suites OK.
- `npm run build`: OK (vite; 4 renderer assets).
- `npm run package:win`: OK (`release/win-unpacked`).
- `npm run package:verify`: OK (packaged CPython 3.13.14 x64 verified).
- `git diff --check`: clean.
- Remnant search: zero hits for all DWM/trace/env/helper identifiers.

## Phase C: install and live Resolve acceptance (DONE — passed)

7. `npm run workflow:install:package`: first attempt blocked by a Resolve-held lock on `workflow-plugin/WorkflowIntegration.node` (Resolve PID 38760); reported, did not kill processes. After the user fully exited Resolve, rerun succeeded: "Copied plugin app to ...\Workflow Integration Plugins\com.wutpeach.clackly".
8. Installed plugin parity verified against `release/win-unpacked`: all 4261 packaged app files byte-identical, `resources/runtimes` 49/49 byte-identical, `window.js` identical and contains the transparent contract, renderer assets 4/4 identical, manifest/package metadata identical, `WorkflowIntegration.node` identical, and all six removed helpers absent.
9. User manual A/B in Resolve — **PASSED**: user reported “问题解决了，没有青边，也没有闪烁” (no cyan edge, no first-open/reopen flicker). All acceptance criteria in `prd.md` are marked passed.
10. No lifecycle reuse was added; live validation proved the existing close/destroy and reopen behavior is flicker-free.

## Rollback points

- Revert the two option lines and the contract-test assertion; no other files are touched.
- No registry or persistent OS state needs restoration.
- Performance note: the transparent surface removes the previous ~44-119 ms packaged Python call entirely; no timing gate applies.
