# Extension Views #8-A — development validation

Date: 2026-11-06. Baseline: accepted #7-B `4f0e4d3` on `main`.
Scope: [approved #8-A instruction](https://github.com/Wutpeach/Clackly/issues/8#issuecomment-6677753966).
Status: development candidate; **awaiting user Resolve Workflow product acceptance**.
No current Workflow deployment, Push, Tag, Release, Issue closure or #8-B work.

## Delivered behavior

- Manifest schema 2 adds explicit `view:{version:1}` commands. Schema 1 and
  ordinary #7 Command/Prepare remain supported. Old Hosts reject schema 2.
- Both Electron entrypoints route Open View to a separate Host controller. One
  ordinary resizable window per extension, maximum eight; repeat restores/focuses
  without loading again. Blur keeps it visible. Minimize retains state; close
  ends the session; reopening rereads data and restores clamped normal bounds.
- Single-column List → Detail navigation, local search/tag filtering, stable
  selection, contextual Host/Extension Actions, same-window confirmation,
  empty/loading/error/retry and explicit refresh. Enter runs the visible primary
  action; Escape closes Actions before navigating back. Ctrl+. is window-local,
  uses no global shortcut registration, and avoids Palette Ctrl+K. Customized
  Resolve shortcut conflicts still require the user's real-host check.
- Plain, bounded data only; sender/main-frame, revision/config, page version and
  stable item checks; duplicate/late requests are rejected. Config/Replace/
  disable/uninstall invalidate sessions. Python callbacks reuse existing
  integrity validation, managed runtime, output limits and 10-second timeout.
- Public protocol: `skills/clackly-developer/references/views.md`, updated
  Developer Skill/helper and self-contained Marker Browser source.
- Marker Browser reads GetMarkers and provides details/copy/refresh/live target
  verification. It never moves the playhead or edits project/timeline/markers.
  Installed Blackmagic `DaVinciResolveScript.pyi` confirms GetMarkers and
  project/timeline GetUniqueId; this is API-reference evidence, not a live test.

## Final verification

Commands below run in `resolve-command-center` unless noted. Logs/artifacts are
local ignored files under `build/`; they are not GitHub-hosted attachments.

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run test:node` | 497 passed, including 10 new View tests and existing #7/Settings/search/usage/update logic | `build/issue8a-node.log` |
| `python -m unittest discover -s script-runtime -p 'test_*.py'` | 25 passed | `build/issue8a-python.log` |
| `node --test script-runtime/host-bridge-integration.test.js` | 3 passed, real Python bridge isolation | `build/issue8a-host-bridge.log` |
| `node --test extensions/extensionView.integration.js` | 1 passed, real package helper/install/RuntimeLauncher/Python; simulated Resolve; actual 10-second timeout and recovery | `build/issue8a-runtime.log` |
| `node --test extensions/extensionView-ui.integration.js` | 1 final complete flow passed, real isolated Electron/preload/IPC/Core/Python/clipboard; simulated Resolve | `build/issue8a-ui-final.log`, `build/issue8a/electron/receipt.json` |
| `node --test extensions/extensionView-focus.integration.js` | 1 passed, built renderer in headless Edge; confirmation Tab/Escape/focus, copy → keyboard focus → Escape/back; 480×360 without horizontal overflow | `build/issue8a-focus.log`, `build/issue8a/electron/focus-fixed-headless.png`, `confirmation-headless.png` |
| `npm run build`, `git diff --check` | Passed; existing bundle-size advisory remains | `build/issue8a-build.log` |
| Impeccable context/design review/detector | Existing palette/Settings visual authority preserved; one radius advisory corrected to existing `--radius-toolbar` token | `build/issue8a-impeccable.json`, rendered screenshots |

The Electron flow covers local search/filter without Python, detail/copy/
Actions/Escape and preserved list state; singleton/minimize/different extensions;
visible on focus change, ordinary/not-topmost native flags and work-area bounds;
close/reopen and 540-pixel saved width; English/Chinese, 480×360; empty/read
failure/retry/deleted-target rejection; disable closes the View; #7 static
Command input/result still executes through real Python. Renderer page errors: 0.

Screenshots actually reviewed: `list-filtered-en.png`, `detail-en.png`,
`actions-en.png`, `list-zh-min.png`, `list-zh-480.png`, `empty-zh.png`,
`failed-zh.png`, `stale-zh.png`, `confirmation-headless.png` under `build/issue8a/electron/`. Early interrupted
runs exposed copy-menu focus loss and shared-CSS layout/titlebar collisions;
these were fixed. Fixture startup/search expectations/close method/receipt scope
were also corrected. The final flow passed; intermediate logs are not PASS
evidence. Full UI suites were not repeated after the final radius-token, English
item-count wording and confirmation button/focus corrections; the build and
targeted headless regression were used for those small corrections.

## Limits and live acceptance

- No real Resolve project or current user Workflow was operated. Focus transfer
  to Resolve, custom keymaps, DWM appearance, monitor/DPI changes and true marker
  data remain user acceptance items. #7-B/Settings/Pin/Recent and installer logic
  have Node regression coverage; only #7 static Command was rerun in Electron.
- No persistent worker, polling, subscription, OS sandbox or cancellation. Close
  discards a late result; a running callback can continue until its existing
  timeout. Third-party Python still has the user's permissions.
- Marker identity combines project/timeline IDs, frame and content fingerprint;
  identical deletion/recreation at the same frame is indistinguishable. It must
  not be reused as a write identity. More than 500 markers or protocol/output
  limits fail explicitly. Long displayed notes/names use documented limits.
- Lists/details are snapshots. Copy may copy old data. Explicit refresh and live
  Extension Actions revalidate; a removed selection is cleared, not replaced
  silently. Select a row after refreshing an empty or changed list.
- #8-B Form/edit/delete/drafts/unsaved confirmation are not implemented.

After explicit authorization for this installation, use the existing
`npm run workflow:deploy:dev` flow for the exact local candidate, with Resolve/
Clackly exited, full Runtime checks and backup/rollback. Then import the public
Marker Browser `.clackly` in Settings → Extensions and search 打开标记浏览器.
The user should verify the browsing/refresh/focus/minimize/reopen workflow and
existing #7-A/B commands/Settings/Pin/Recent on their own local Resolve project.
Keep Issue #8 open as **#8-A awaiting product acceptance**; #8-B needs a separate
explicit development instruction after A acceptance.
