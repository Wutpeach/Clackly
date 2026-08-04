# Implementation Plan

1. Update the frontend window contract in `.trellis/spec/frontend/quality-guidelines.md` for the fixed frameless Settings window and Electron 36.3.2 baseline.
2. Pin `electron` to exact `36.3.2` with npm so `package.json`, `package-lock.json`, and installed metadata agree.
3. Make `createPaletteWindow` injectable like `createSettingsWindow`, remove unsupported `accentColor`, and apply/test the complete fixed frameless palette option contract.
4. Reduce `SETTINGS_SIZE` to `760x560`; replace native title-bar/minimum/resizing options with the complete fixed frameless Settings option contract and update its focused-singleton tests.
5. Add the shared `settings:close` preload/IPC callback, then add one accessible custom close button to the existing draggable Settings title bar. Do not add minimize or resize behavior.
6. Verify sidebar/detail scrolling within the fixed Settings workspace and add only required CSS constraints.
7. Update README compatibility and validation notes with Resolve 20.3.2.9 / Electron 36.3.2 and the requirement to validate native window chrome inside Workflow Integration.
8. Run targeted window and Feature UI IPC tests, then `npm test`, `npm run build`, `npm run package:win`, and `npm run package:verify`.
9. After confirming Resolve can be restarted safely, install the packaged Workflow Integration and manually validate palette/Settings borders, drag/close, keyboard focus, blur-to-hide, exact sizes, and internal scrolling.

## Review Gates

- Before package generation: inspect the dependency/lockfile diff and both exact BrowserWindow option assertions.
- Before live validation: confirm no unrelated packaged resources changed and ask before restarting Resolve.
- Final check: search for `accentColor`, obsolete Settings minimum/title-bar overlay options, and renderer-side Node/window coupling.
