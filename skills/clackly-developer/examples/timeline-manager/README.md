# Timeline Manager — Extension Views B example

Requires a Host with #8-B support (development candidate, not a published release).
Package with:

```powershell
python skills/clackly-developer/scripts/package_extension.py skills/clackly-developer/examples/timeline-manager build/timeline-manager.clackly
```

Install the `.clackly` file through Clackly Settings → Extensions. Open
“打开时间线管理示例” only in an explicitly disposable **local test project**.
Create saves an empty timeline; Edit changes its name; the batch action adds
`Review - ` to selected names. Each write needs explicit confirmation. No delete,
clip edit, automatic save, undo or transaction rollback is provided.

Uses Resolve `Project.GetUniqueId`, `GetTimelineCount`, `GetTimelineByIndex`,
`Timeline.GetUniqueId`, `GetName`, `SetName`, and
`Project.GetMediaPool().CreateEmptyTimeline`. These were checked against the
installed official Scripting API declarations; real Resolve write acceptance
still belongs to the user. The automated tests use a disposable file-backed
Resolve fixture with real short-lived Python and isolated Electron.

Targets bind native project/timeline IDs plus the loaded name fingerprint.
Before each rename, the extension finds that native ID again in the current
project and rejects name changes or missing targets. It never resolves writes
by list index or name. Create binds the project captured when opening the Form.
Like the Resolve API generally, read-check-write is not atomic against concurrent
external edits; use a quiet test project. Identical name changes away and back
are indistinguishable. Confirmations do not sandbox third-party Python.

Use the ActionPanel from List or Detail for Create/Edit. A successful save
returns a freshly read List. Multiselect is explicit, bounded to 100 visible
IDs; partial failures list a reason for every failed target. Manual refresh
and opt-in window refocus refresh read source data; Forms are never refreshed
on focus. Failed saves retain the current draft; check source data before
retrying after any timeout/connection failure.
