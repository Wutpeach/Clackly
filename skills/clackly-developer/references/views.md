# Extension Views (#8-A development candidate, not a published release)

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

context.phase is view or view_action. context.input is empty. context.view has
sessionId, revision, version, viewId, type (list/detail), itemId (or null).
Extension Actions add actionId and scope (item/view). Reread live Resolve targets
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

## Read-only example

[Marker Browser](../examples/marker-browser/manifest.json) and
[Python source](../examples/marker-browser/markers.py) read current timeline
GetMarkers, browse/search/filter, copy, refresh and verify live targets. They do
not change playhead/project/timeline/markers. The API has no guaranteed stable
marker ID: the example combines project/timeline IDs, frame and content fingerprint.
Identical delete/recreate at the same frame cannot be distinguished; do not use
this identity for writes. Over500 markers, excessive output or missing stable IDs
fail explicitly. Project/timeline switch or changed marker rejects old Actions.
No Form/edit/delete/drafts (#8-B), two-column layout, custom UI, Lua/JS Runtime
or real-time/background work is implemented.
