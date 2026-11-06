# Extension Views #8-B — development validation

Date: 2026-11-06. Baseline: user-accepted #8-A
`d246ca3873ae1796ec16f15b39cfe262261b4558` on `main`.
Scope: [approved enhanced B instruction](https://github.com/Wutpeach/Clackly/issues/8#issuecomment-6679146437).
Status: **development candidate, awaiting user product acceptance**.
This report belongs to the local implementation commit; no Push/Tag/Release,
Workflow deployment, Issue closure or work outside #8 was performed.

## Delivered behavior

- Same-window Form from List/Detail Extension Actions; reuses #7 SettingsRenderer,
  field schema, initial values and validation. Explicit submit calls existing
  short-lived `view_action` with `scope:form` and validated `context.input`.
  No new Python phase, editor framework or persistent process.
- Host-owned transient drafts: clean navigation is quiet; dirty Back, Close
  (including native close), refresh or another action prompts Keep editing /
  Discard changes. Keep editing is the default focus; Escape cancels the prompt.
  Failed saves preserve fields and error. Saving blocks duplicate submission and
  window close. Discard does not submit.
- Successful Form back/refresh rereads its source; successful push replaces that
  source with the extension's freshly read List/Detail. This avoids retrying an
  old Detail identity after a rename. Completed saves whose subsequent refresh
  fails do not offer the original Form for accidental replay.
- Optional List batchActions expose multiselect, visible-result selection and
  clear. Host validates at most100 unique visible IDs, exact confirmation
  selection and batch summary totals/failure IDs. The UI shows full/partial/
  failed counts and concrete per-object errors. Refresh reconciles selections.
- Optional List/Detail refreshOnFocus; only after blur/refocus, while ready and
  without confirmation. Never refreshes Forms or polls in the background.
- Updated both Electron entrypoints/preload, public protocol and Developer Skill.
  Existing Manifest2/View1 uses additive fields; #8-A-only Hosts reject B fields.
- Public Timeline Manager demo creates empty timelines, edits names and batches
  a Review prefix, with explicit confirmation. Uses native project/timeline IDs
  and name fingerprints, never Marker write identities. Resolve API names were
  checked in the locally installed official Scripting declarations.

## Verification

| Check actually run | Result and coverage |
| --- | --- |
| `node --test extensions/extensionView.test.js extensions/commandUi.test.js extensions/CommandUiHost.test.js` | 27 passed during development: Form/schema/values, discard/back/close/switch, input validation, duplicate/stale submission, confirmation, post-save refresh failure, bounded/exact batch/partial results and refocus draft protection; includes #7 behavior |
| `npm run test:node` | **503 passed**, including all above plus existing Settings, search, usage, extension lifecycle/installer and update logic |
| `python -m unittest discover -s script-runtime -p 'test_*.py'` | **25 passed** |
| `node --test extensions/extensionView.integration.js script-runtime/host-bridge-integration.test.js` | **4 passed**: accepted read-only Marker package, stale/empty/failure/actual timeout recovery, real bridge/Python isolation |
| `node --test extensions/extensionView-edit.integration.js` | **1 passed**, real packaging/install/RuntimeLauncher/Python, fake Resolve; Create/Edit, project drift, renamed/deleted targets, no mistaken writes, full/partial/failed batch, per-item API exceptions, 100 Unicode IDs and failed creation |
| `node --test extensions/extensionView-form.integration.js extensions/extensionView-focus.integration.js` | **2 passed**, built renderer in headless Edge; six shared field types, failed-input retention, safe draft focus/Tab/Escape at480×360 and640×560, accepted Detail/copy/confirmation focus |
| `node --test extensions/extensionView-edit-ui.integration.js` | **1 final complete flow passed**, real isolated Electron/Core/preload/IPC/installed package/short-lived Python, file-backed simulated Resolve. Create required/default/confirmation, Edit from Detail, failed save retention/recovery, dirty Back and native close, refocus leaves Form alone, batch partial/all failed/all succeeded, real native focus removes deleted selection, discard closes without writing, #7 static Command result. Renderer page errors **0** |
| `npm run build`, `git diff --check` | Passed; existing Vite bundle-size advisory remains |
| Impeccable `detect --json` for changed View JSX/CSS | `[]`; screenshots inspected for shared typography/surfaces/controls, draft focus and partial-result readability |

Validation was staged: narrow Host/Python checks first, then headless states,
then the complete Electron flow once stable. Intermediate Electron harness
checks initially assumed synchronous checkbox IPC and read row count before
focus refresh completed. These waits were corrected; batch/focus checks were
resumed with `CLACKLY_VIEW_B_AFTER_EDIT=1`, then the complete final B workflow
passed. Earlier fixture stderr also recorded missing Palette-only handlers;
the fixture now supplies them. These were isolated fixture/harness issues, not
production Resolve evidence. No full application UI suite was run per edit.
After the last demo-only API-exception handling change, only its real Python
integration was rerun; already-passed renderer/Electron evidence was reused.

## Reproducible evidence

All following paths are local under `resolve-command-center`; they have not been
uploaded to GitHub or deployed:

- Logs: `build/issue8b-node.log`, `build/issue8b-python.log`,
  `build/issue8b-runtime-integration.log`, `build/issue8b-edit-integration.log`,
  `build/issue8b-electron.log`.
- Full Electron receipt: `build/issue8b/electron/receipt.json`, listing all checks,
  callback contexts and the four simulated writes. `receipt-batch.json` records
  the resumed batch/focus-only run.
- Screenshots: `build/issue8b/headless/form-controls-640.png`, `draft-480.png`;
  `build/issue8b/electron/create-form.png`, `save-confirmation.png`, `dirty-back.png`,
  `failed-save-keeps-draft.png`, `multi-select.png`, `batch-partial.png`,
  `refocus-clears-stale-selection.png`.
- Installable demo: `build/issue8b-timeline-manager-1.0.0.clackly`. SHA-256:
  `E5197006EC22B105FC8351B80932DEEA64136DF10C7C6D8C8FF6F4BA4CB2DD13`.
- Final screenshots, full receipt and logs: `build/issue8b-evidence-20261106.zip`.
  SHA-256: `EA169B9E911A39C3E3514B422F67B05E091AB95D1B84174E0D1CD1BDAC152DF1`.
- Protocol: `skills/clackly-developer/references/views.md` (from repository root);
  runnable source/instructions: `skills/clackly-developer/examples/timeline-manager/`.

## Limits and pending acceptance

**No live Resolve writes, no B Workflow installation, no user product PASS.**
The current installed/user-accepted Workflow remains #8-A. Real native API
behavior, Resolve focus/DPI/custom keys and the B user experience still need
user-owned testing after separately authorized safe development deployment.
The Node suite covers existing Settings/Prepare/install behavior; this B
Electron run additionally executes #7 static Command, not every existing UI.

Host validates schema/revision/session/inputs/selection, not business authority.
Third-party Python remains unsandboxed; dangerous:true requires confirmation,
but authors must identify risky work. No transaction/automatic rollback/Undo,
auto-save, cross-session drafts, streaming or background subscriptions. Explicit
config/Replace/disable/uninstall invalidation and Host shutdown retain #8-A's
session destruction behavior, without recoverable drafts.

The example binds native IDs and a name snapshot; revalidation is not an atomic
Resolve transaction against concurrent external edits. Identical name changes
away and back cannot be detected. Use an idle, explicitly disposable **local**
test project. Check source data before retrying after timeout/connection failure;
an error cannot guarantee that Python performed no writes. Form keep leaves the
draft; successful callbacks should return back/refresh/push/close as documented.
Batch size100 still shares the existing10-second callback limit.

For later product acceptance: install the exact local commit only after user
authorization using `workflow:deploy:dev`; then import the packaged demo through
Settings → Extensions. In a disposable local project, test Create, Edit from
List/Detail, dirty Back/native Close/discard, invalid/stale save, multiselect and
batch confirmation/results, source refresh and refocus. Keep Issue #8 open
until the user accepts B and separately requests final archival.
