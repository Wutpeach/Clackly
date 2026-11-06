# Python Extension V1 contract

Verified against Clackly's V1 implementation on 2026-11-05. This reference is
self-contained. Upstream sources for future maintenance: [package protocol](https://github.com/Wutpeach/Clackly/blob/main/resolve-command-center/docs/extension-package-v1.md),
[installer](https://github.com/Wutpeach/Clackly/blob/main/resolve-command-center/extensions/package.js),
[Python Runner](https://github.com/Wutpeach/Clackly/blob/main/resolve-command-center/script-runtime/python_runner.py).
Do not fetch or clone the repository just to use this Skill.

## Archive and manifest

A `.clackly` is a ZIP with UTF-8 `manifest.json` at its root, not inside an
enclosing folder. Include Python sources and any resources beside it:

```text
manifest.json
inspect.py
resources/message.txt
```

Minimal manifest (no configuration required):

```json
{
  "schemaVersion": 1,
  "id": "example.my-tools",
  "name": "My Tools",
  "version": "1.0.0",
  "description": "Read-only Resolve helpers",
  "source": "Your name or project URL (self-declared)",
  "commands": [
    {"id": "inspect", "name": "Inspect Project", "entry": "inspect.py", "keywords": ["project"]}
  ]
}
```

- Required: `schemaVersion` exactly `1`, Extension `id`, nonblank `name`, canonical
  SemVer `version`, nonempty `commands`. Use `1.0.0` or a prerelease such as
  `1.0.0-beta.1`; no `v` prefix or leading zero numeric components. The current
  installer's canonical-string check rejects `+build` metadata; omit it.
- IDs match `^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$`, at most 80 characters. Avoid
  reserved `constructor` and `prototype`. Each command has its own unique local
  ID, nonblank name and exact, case-sensitive relative `.py` entry. Full runtime
  ID: `extension:<extension-id>/<command-id>`. Multiple commands can share an
  entry and dispatch using `context.command_id`, or use separate files.
- `description` and `source` are optional strings (maximum 2,000 characters).
  Source is author-supplied text, not a verified publisher identity/signature.
  Command `description` is optional; `keywords` is an optional list of up to 50
  strings, each at most 120 characters. Extension/Command names: at most 120.
- Optional `configSchema` is an object shared by all commands in the extension.
  Unknown top-level fields do not add capabilities. No SDK, hooks, permission
  manifest or extra command-registration files are needed.

Limits: archive and total uncompressed size each 32 MiB; single file 8 MiB;
512 ZIP entries; manifest 128 KiB; 100 commands; 50 configuration fields. Use
relative `/` paths of at most 180 characters. No absolute paths, `.`/`..` path
segments, backslashes, Windows reserved/device names, ADS, trailing dots/spaces,
links, encrypted files, case collisions or file/directory conflicts. Clackly
checks actual lengths and CRC. Keep the source folder free of secrets, virtual
environments and unrelated files; the helper includes ordinary resource files.
It skips dot-prefixed files/directories, `__pycache__`, `.pyc`, `.pyo` and old
`.clackly` outputs.

## Persistent settings

```json
"configSchema": {
  "label": {"type": "string", "label": "Log label", "required": true},
  "includeTimeline": {"type": "boolean", "label": "Include timeline"},
  "mode": {"type": "select", "label": "Report detail", "options": ["brief", "full"]},
  "destination": {"type": "folder", "label": "Output folder"}
}
```

This is a manifest fragment. Supported types: `string`, `number`, `boolean`,
`color`, `path`, `folder`, `select`. Fields support only `type`, optional
nonblank `label`, boolean `required`, and `options` for select (a nonempty array
of nonblank strings). Keys match `^[a-zA-Z][a-zA-Z0-9_]{0,79}$`;
`constructor`, `prototype` and `__proto__` are reserved. Select option strings
are both displayed values and stored values; preserve them for compatibility.

Settings generates the UI. No schema `default`, nested objects, per-command
schema, custom validators or controls are implemented. Use
`context.config.get("includeTimeline", False)` for an absent optional value.
String/color/path/folder values are strings; number values must be finite;
boolean values are booleans; select values must match an option. A schema path
type does not prove the file exists: check that in your command when needed.
Required values must be present (required string-like values must be nonblank)
before saving and execution; `False` and `0` satisfy required booleans/numbers.
These are saved, long-term settings, not a form shown on each execution.

On Replace/Update, fields retain values only when key, type and allowed value
remain compatible. Old values remain in state until configuration is saved,
but unknown/incompatible values are not passed to Python. New required fields
cause Needs Setup. Saving replaces the stored configuration with current values.

## Python entry and host context

Export `def execute(context)` or `async def execute(context)`. Return a
JSON-serializable value: `None`, booleans, strings, finite numbers, lists or
dictionaries with string keys. Never return Resolve objects, Path, sets, bytes,
NaN or Infinity; convert to plain data. Exceptions produce failed execution.

| Member | Actual behavior |
| --- | --- |
| `context.command_id` | Full global command ID string. |
| `context.config` | Dictionary of compatible saved settings. Use indexing only for known required fields. |
| `context.input` | In the #7-A candidate: validated single-run inputs, separate from saved settings. |
| `context.logger.info/warning/error/debug(*values)` | Joins values with spaces into captured log messages; no printf-style formatting. |
| `context.resolve` | Lazily connects through Clackly's Resolve adapter; can raise when unavailable. |
| `context.project`, `context.timeline` | Lazily obtains the current project/timeline pair; **both require an open project and current timeline**. |

For project-only tools or no-project handling, use
`context.resolve.GetProjectManager().GetCurrentProject()` and check for `None`;
then `project.GetCurrentTimeline()` if needed. Do not use `context.project`
as a nullable project-only lookup. Consult Blackmagic's Scripting API docs for
the chosen Resolve operations; Clackly does not add business methods to these
objects. The included Inspector works without an open project.

Use `Path(__file__).parent / "resources" / "message.txt"` for bundled resources;
the working directory and sibling import search path are not package APIs.
Prefer one entry file for small tools. Do not assume sibling modules are on
`sys.path`. If needed, explicitly load local helpers relative to `__file__`.
Installed revisions are integrity-checked and immutable: do not write logs,
preferences or output into them. If output is needed, use a user-selected
external destination; do not hardcode developer machine paths.

Clackly redirects Python bytecode caches outside installed packages into its
managed cache directory, separated by installation revision. Python handles
interpreter cache-format compatibility. Repeated executions can reuse these
caches; Replace/Update starts a new revision and removes the previous cache,
and uninstall removes the active revision's cache. Cache cleanup is best effort
after committing installation state. Extensions need no cache configuration
or manual cache writes, and missing caches are rebuilt on the next execution.

`print` is captured as informational logs, stderr as error logs. Use concise
logger messages for user feedback. A return value is execution data, not an
automatically rendered panel, table or file. The #7-A development candidate adds
explicit static input and result semantics; see [Command UI](command-ui.md).
The #7-B development candidate adds bounded options/defaults for fixed inputs;
see [Dynamic Prepare](prepare.md). The #8-A candidate adds a Host-owned independent
tool window through [Extension Views](views.md), requiring Manifest schemaVersion2.
No custom frontend UI or mid-execution RPC.

Execution uses Clackly's managed CPython, Resolve compatibility probe and a
short-lived worker. Installed does not mean runnable: Resolve must be running
with its Scripting API available and compatible with the selected managed
runtime. No PATH Python discovery or execution-time fallback occurs. Local
Python 3 is only a development/packaging prerequisite. Do not promise that
arbitrary third-party Python modules are installed in Clackly's runtime.

Each execution has a 10-second limit; stdout and stderr are each capped at
1 MiB (including the protocol/output overhead). Async does not bypass limits
or provide persistence. There is no sandbox: scripts have current-user
permissions. Do not auto-install dependencies, run installation hooks, or
copy code to Clackly/Resolve installation or Resolve Scripts directories.

## User installation and iteration

The user opens Settings → Extensions, chooses Install and the `.clackly`,
reviews source/risk and confirms. Same ID and SemVer precedence = Replace;
higher = Update; lower = explicitly labelled Downgrade. Each import requires
confirmation. Configure required fields, save, then search the Command name
in Palette. Commands refresh without restarting Clackly. Resolve/runtime
availability is checked separately. Preserve identity during iteration.

Default Windows managed root: `%APPDATA%/Clackly/extensions/`. Clackly owns
`packages/<id>/<revision>/`, `state.json` and `staging/`. These are explanatory
paths, not developer install targets. Use Settings for installation, updates,
enable/disable and uninstall. Disable preserves files and settings; uninstall
preserves settings by default with an option to delete them. Do not edit state,
installed scripts or revision pointers. Source edits require a newly packaged
import.
