# Extension Views — #8-A / #8-B accepted Host support

Accepted in the current development Host, not a published release.

Use Views for tools that remain open for browsing and actions. Use
[Command UI](command-ui.md) for one-run input/results and [Prepare](prepare.md)
for dynamic one-run choices. They can coexist in one package. Check Host support:
older Hosts reject Manifest schemaVersion 2.

## Manifest and callbacks

    {"schemaVersion":2,"id":"example.browser","name":"Browser","version":"1.0.0",
     "commands":[{"id":"open","name":"Open browser","entry":"main.py","view":{"version":1}}]}

Open View commands cannot also declare ui. Export view(context) and optional
view_action(context), synchronous or async, returning JSON. Ordinary Commands
still export execute(context). Keep Resolve calls inside callbacks, never imports.
The packaging helper checks view; view_action is required when Extension Actions
are used. ConfigSchema and existing public context remain available.

context.phase is view or view_action. context.input is empty except for validated
Form submissions. context.view has sessionId, revision, version, viewId, type
(list/detail/form), itemId (or null), and itemIds (an array, normally empty).
Extension Actions add actionId and scope (item/view/form/batch). Reread live Resolve targets
using stable IDs before business work. Host context does not prove a target
still exists; never silently substitute a changed/deleted object.

## List and Detail data

    def view(context):
        return {
            "$clackly": "view", "version": 1, "id": "objects", "type": "list",
            "title": "Objects", "subtitle": "Last loaded snapshot",
            "emptyMessage": "No objects. Refresh after the source changes.",
            "items": [{
                "id": "stable-object-id", "title": "Name", "subtitle": "Description", "tag": "Blue",
                "detail": {"title": "Name", "text": "Plain text, not HTML",
                           "fields": [{"label": "ID", "value": "stable-object-id"}],
                           "actions": [{"id": "copy", "title": "Copy", "type": "copy"}]},
                "actions": [{"id": "inspect", "title": "View details", "type": "detail"}]
            }],
            "actions": [{"id": "refresh", "title": "Refresh", "type": "refresh"}]
        }

Detail envelopes use $clackly/version/id/type:detail/title and optional
subtitle/text/fields/actions, no items/emptyMessage. Embedded detail uses
title/text/fields/actions only. All content is plain text, not HTML/Markdown,
URLs, media or custom frontend code. Host renders a monochrome item icon.
List subtitle/title truncate; detail content is selectable and scrollable.

Case-insensitive search uses title/subtitle/tag. Tag also supplies exact filtering.
Search/filter/selection/navigation/copy are local: they never start Python.
Back preserves list query/filter/selection. Refresh preserves valid state and
clears removed selection with a notice, without substituting another object.
Detail is a snapshot; copying may copy old data. Refresh/live Action revalidates it.

## Actions and navigation

Each item and view has up to8 actions with unique id, title and type. Item
actions precede view/global actions. The first available action is the primary
button/Enter operation. Ctrl+. opens ActionPanel only in the focused View;
arrows navigate list/menu. Escape closes ActionPanel first, then confirmation,
then returns one page; at root it keeps the tool open. Close/Alt+F4 ends it.

Types: copy (optional text, else copy item's embedded detail/current Detail),
detail (item with embedded detail only), refresh, back, extension. Only extension
starts Python. It may declare confirm:{message:"Consequence"}; confirmation
happens in the same window and is not a sandbox/permission grant.
Extension actions may declare dangerous:true, which requires confirm. Host cannot
infer business risk from arbitrary Python: authors must mark destructive work.

    def view_action(context):
        # Verify context.view['itemId'] against current Resolve data first.
        return {"$clackly": "view-action", "version": 1,
                "effect": "keep", "message": "Object still available"}

Effects: keep (notify), refresh (call view for current page), push (requires valid
view envelope), back, close. message is optional. Navigation has at most8 pages.
For embedded Detail refresh, view(context) receives type:detail and originating
itemId: return a Detail. Each Action binds revision/config/session/page-version
and selected stable ID; busy windows reject duplicates. Replace/disable/uninstall/
config changes close affected windows in this Host. Cross-Host state changes
reject the next request; reopen Clackly if stale. Failed/timed-out Actions must
be checked before retry; refresh never repeats the business Action automatically.

## Create/Edit Forms (#8-B)

Return an ordinary push result from a List or Detail Extension Action:

```python
return {
    "$clackly": "view-action", "version": 1, "effect": "push",
    "view": {
        "$clackly": "view", "version": 1, "id": "edit-object",
        "type": "form", "title": "Edit object",
        "inputs": {"name": {"type": "string", "label": "Name",
                            "required": True, "default": current_name}},
        "submit": {"id": "save", "title": "Save",
                   "confirm": {"message": "Save this object's new name?"}}
    }
}
```

Form uses the same static `inputs` contract and controls as [Command UI](command-ui.md):
1–20 fields, string/text/number/boolean/select/color/path/folder, defaults,
required, range, descriptions and placeholders. Callback data may supply current
options/defaults; Form does not run #7 Prepare or accept dynamic:true. There are
no hidden fields or arbitrary state: bind project/target identity in view.id
and/or the originating itemId. Form has optional normal actions, but no
items/text/fields/batchActions/refreshOnFocus. submit has id/title and optional
confirm/dangerous, no type.

Only explicit Save calls view_action with scope:form, actionId from submit,
context.input validated against these inputs, and the originating itemId/itemIds.
The extension must revalidate project and target before writing. A failed callback
keeps the Form, values and error. While saving, controls and repeated submission/
close are blocked. There is no automatic retry, auto-save or rollback. After a
timeout/failure, check source data before retry: Python may already have written.

For successful Form submissions, `back`/`refresh` finish the Form, return to its
source page and call view again. `push` finishes the Form and **replaces its source
page** with the returned freshly read view; use this to return a current List or
Detail when the old source identity has changed. It does not append another Form
or require reloading a now-stale parent first. `close` ends the session. `keep`
stays in the Form with its draft; use an exception for validation/save errors.
With a root Form, back/refresh reload it; Cancel closes it.

Host holds only current-session values and compares them to initial values. Clean
Back/Close/actions proceed directly. Dirty Back, manual refresh, another action
or native Close shows **Keep editing / Discard changes**; continuing is the safe
default, Escape continues editing. Discard restores initial values and performs
the pending navigation/action, without submitting. Other explicitly chosen
Extension Actions may themselves write; Discard is not an authorization layer.
No draft persists after leaving/closing. Host shutdown, process loss, or explicit
extension config/Replace/disable/uninstall invalidation still destroys the
session as in #8-A; this is not recoverable draft storage.

## Optional multiselect and batch results (#8-B)

Add `batchActions` to a List to expose Select multiple, Select visible and Clear.
It uses the same action schema (up to8), extension type only. Ordinary lists
remain single-select. In multi mode, batch actions replace item actions; global
view actions remain available. Space toggles a focused row; checkboxes also work.

The Host sends scope:batch and context.view.itemIds, at most100 unique IDs from
the current visible List. Confirmation binds that exact selection. Search/tag
changes and refresh remove selections no longer visible/present, with a notice;
the Host never substitutes targets. Use native stable identities, not positions.

Batch callbacks must return a summary matching the submitted total. Supply one
concrete error per failed submitted ID; success, failure and partial success all
use the same contract:

```python
return {"$clackly": "view-action", "version": 1, "effect": "refresh",
        "summary": {"succeeded": 1, "failed": 1,
                    "errors": [{"id": failed_id,
                                "message": "Timeline B: Resolve rejected rename"}]}}
```

Counts are nonnegative integers, total at most100; failed IDs must be unique
and belong to the submitted selection. The Host shows counts and plain-text
errors, then uses the selected effect. Put identifiable target names/IDs in
messages. A summary can also accompany other action results. `refresh` rereads
without repeating writes; failure to reread keeps the result/error visible.
Host does not implement transactions, automatic rollback or Undo.

## Optional refocus refresh (#8-B)

List/Detail envelopes may declare `refreshOnFocus:true`. After the native window
loses and regains focus, Host reloads the current ready page, unless it is busy
or confirming. Forms never refresh on focus, even when their source opts in.
There is no background polling/subscription. Detail refresh still uses its
originating itemId; reject a disappeared/stale target rather than showing another.
Manual refresh remains available.

## Windows, runtime and limits

One active window per extension per Host, at most8 different extensions. Reopen
restores/focuses without reload/navigation reset. Minimize preserves session;
Close releases it and discards late results; reopen loads a new session. Ordinary,
resizable, not topmost, visible on blur. Manual close saves normal bounds; reopen
clamps to available work area. Each callback uses a separate short-lived Python
worker limited to10 seconds. Closing stops waiting, cannot undo effects. No
persistent UI process/RPC, polling, streaming or cancellation; Python is unsandboxed.

View JSON: 524,288 serialized characters plus Runtime1MiB output (UTF-8 may hit
the byte limit sooner). List500 unique items; IDs view120/item512/action80;
title200/action-title120; subtitle list500/view2000; emptyMessage2000; tag80;
text32768; Detail50 fields (label120/value2000); copy text8192; result message2000.
Unknown fields/types, duplicates and excess values fail closed.
Form input:32,768 serialized characters; each string8192. View callback context:
65,536 serialized characters (Unicode-safe Python encoding), enough for100
bounded IDs. Summary error IDs512, messages2000; overall action response524,288
characters. These additions keep View version1/Manifest schema2; a #8-A-only Host
rejects new Form/batch/refocus fields safely. Test target Host support before delivery.

## Read-only example

[Marker Browser](../examples/marker-browser/manifest.json) and
[Python source](../examples/marker-browser/markers.py) read current timeline
GetMarkers, browse/search/filter, copy, refresh and verify live targets. They do
not change playhead/project/timeline/markers. The API has no guaranteed stable
marker ID: the example combines project/timeline IDs, frame and content fingerprint.
Identical delete/recreate at the same frame cannot be distinguished; do not use
this identity for writes. Over500 markers, excessive output or missing stable IDs
fail explicitly. Project/timeline switch or changed marker rejects old Actions.

## Write example (#8-B)

[Timeline Manager](../examples/timeline-manager/README.md) demonstrates Create
empty timeline, Edit name from List/Detail, confirmed batch prefixing, partial
results and refocus refresh. Use only a disposable local test project. It binds
native project/timeline IDs and a name snapshot, revalidates before each write
and refuses changed/deleted targets. It never uses the read-only Marker identity
for writes. Tests use a file-backed fake Resolve plus real Python/Electron;
these do not establish native Resolve write acceptance. Read-check-write is not
atomic against concurrent Resolve edits. No deletion, two-column/custom UI,
Lua/JS Runtime, background process, transaction framework or Undo is included.
