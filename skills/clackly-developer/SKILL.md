---
name: clackly-developer
description: Build or update DaVinci Resolve tools as Clackly Python Extension packages. Use for requests to create Clackly extensions, commands, views, manifests, persistent settings, or installable .clackly files.
---

# Clackly Developer

Turn the user's tool request into Python source, a versioned manifest, and an installable
`.clackly` ZIP. This folder is self-contained; no Clackly checkout, SDK, Node, Git
commit, or application build is needed. Use Python 3 for the packaging helper.

## Develop

1. Understand the requested outcome and whether it reads or modifies Resolve
   data. Ask only when a missing decision changes the tool's behavior or safety.
   Check feasibility against [the V1 contract](references/extension-v1.md) before
   promising features. Python commands and persistent declarative settings are
   supported. The accepted #7-A implementation also supports static one-run input,
   confirmation and structured results; read [Command UI](references/command-ui.md)
   when needed and check that the target Host includes it. For dynamic choices
   and defaults, read [Dynamic Prepare](references/prepare.md): the accepted #7-B implementation
   adds one-shot prepare(context), not dynamic fields or persistent RPC. For a
   continuously open tool, read [Extension Views](references/views.md): #8-A adds
   Host-rendered List/Detail/Navigation/ActionPanel in one ordinary window per
   extension, short-lived view/view_action callbacks and Manifest v2.
   Start from the [read-only Marker Browser](examples/marker-browser/manifest.json).
   Check target Host support. Custom UI, Lua
   extensions and dependency installers are not supported. Ordinary Resolve Python/Lua Scripts are a separate existing feature,
   not this extension format.
2. Read the relevant contract before authoring the manifest and callbacks. Start
   from [Project Inspector](examples/inspect-project/manifest.json) and its
   [read-only entry](examples/inspect-project/inspect.py) when useful. Copy into a
   separate, clean package-source folder. Choose your own stable Extension ID;
   do not reuse the example ID for unrelated tools. One package can contain
   multiple commands. Match names, descriptions, keywords and setting labels to
   the user's language.
3. Use `context.resolve` and the documented Resolve Scripting API for business
   operations. Clackly supplies the connection; do not import Clackly internals
   or bootstrap another bridge. Verify Resolve method names against the user's
   available Blackmagic Scripting API documentation when uncertain; the Skill
   is not a complete Resolve API reference. Keep host calls in callbacks, not
   module import. For long-lived settings use the extension-wide `configSchema`
   and `context.config`; no React UI or separate configuration file is needed.
4. Keep operations within one 10-second execution and the output bounds in the
   contract. Use the Python standard library where practical. Do not silently
   install dependencies, add hooks, or modify Clackly/Resolve installation trees
   or Resolve Scripts directories. Third-party code runs with the user's
   permissions, without a sandbox. Treat packaged resources as read-only.

## Verify and package

- Check Python syntax and test deterministic logic with small fixtures. Exercise
  `execute` with a fake context for both useful results and missing host data.
  These are offline checks, not proof of Resolve compatibility. Do not operate
  on real projects, media, timelines or markers without the user's authorization;
  leave live testing to the user when that is their chosen workflow.
- Run the helper from anywhere, replacing the paths below with actual paths
  (Windows: `py -3` or a confirmed Python 3 `python`; macOS/Linux: `python3`):

  ```text
  python /path/to/clackly-developer/scripts/package_extension.py /path/to/package-source /path/to/output/tool-1.0.0.clackly
  ```

  Output must be outside the source folder and must not already exist. The
  helper checks basic identity, exact entry paths, Python syntax and top-level
  execute (or view for Open View), then archives sources and resources. It never imports or executes
  extension code. It is a preflight, not a copy of Clackly's authoritative
  installer validation; installation can still reject a package.
- If Clackly validation is available in an authorized isolated environment,
  check the generated archive there. Otherwise report packaging/offline checks
  accurately and provide the user with the installation and host-test steps.
  Do not install into their current Clackly merely to complete a test.

## Iterate and deliver

Preserve Extension ID, Command IDs and compatible setting keys/types when
updating the same tool. Same SemVer precedence produces Replace; a higher
version produces Update. Renaming a tool is not a new identity. Explain any
intentional incompatible configuration change and any new required field.

Deliver the `.clackly`, editable source, and brief instructions in the user's
language: Settings → Extensions → Install, review/confirm the package, fill
required settings and save, then search the command name in Palette and run.
For an iteration import the revised package and confirm Replace/Update; never
edit installed files. State what the command changes, checks actually run, and
what remains for live Resolve testing. Useful feedback goes to
`context.logger`; ordinary JSON return values do not create a result window.
Use the explicit Command UI result envelope when the target Host supports #7-A.

Skill installation is separate from extension installation. For loading this
Skill in a fresh Agent conversation, see [English](README.md) or
[简体中文](README.zh-CN.md).
