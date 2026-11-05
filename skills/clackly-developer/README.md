# Install and use Clackly Developer

Install this Skill in your **AI Agent**. Install the generated `.clackly` in
**Clackly**. They are different artifacts. An extension-capable Clackly V1
installation and working Resolve Scripting API are needed for live use;
Python 3 alone is enough to develop and package offline.

## Get the Skill

Download the repository with GitHub's **Code → Download ZIP**, extract it, and
keep only `skills/clackly-developer/`. No Git clone or Clackly source build is
required. If you obtain a standalone copy of this folder, it contains everything
needed; keep its references, example and script together with `SKILL.md`.

Copy the folder to your Agent client's supported skill location, or use its
local Skill import workflow. In Cindy, a project skill can be placed at
`<your-tool-workspace>/.agents/skills/clackly-developer/`; restart/start a new
Agent session to pick it up. Other clients use their own documented skill
directories/import controls. This is a standard `SKILL.md` folder, with no
platform-specific tools. If your client has no Skill loader, explicitly ask it
to read `clackly-developer/SKILL.md` and follow its linked local resources.

## Try in a new conversation

Make this folder available, without a Clackly checkout or extra protocol notes.
Ask your Agent, for example:

> Use clackly-developer to build a read-only Resolve project inspection tool.
> Let me configure a log label in Clackly. Deliver the source and an installable
> .clackly. Leave testing in my real Resolve to me.

The Agent needs Python 3 to run the included packaging helper. To package the
unchanged example yourself, run from the Skill folder:

```text
python scripts/package_extension.py examples/inspect-project output/inspect-project-1.0.0.clackly
```

Windows can use `py -3` or a confirmed Python 3 `python`; macOS/Linux normally
use `python3`. Choose a new output filename on subsequent runs.

In Clackly, open **Settings → Extensions → Install**, select the generated
`.clackly` and review/confirm. Save a value for **Log label**, then search
**Inspect Resolve Project** in Palette and run. Resolve must be running with
its Scripting API available. This example only reads the Resolve version and
whether a project is open; it does not need a current timeline.

For changes to the same tool, keep IDs and compatible setting keys/types.
Import again: same version precedence offers **Replace**, higher offers
**Update**. Saved compatible configuration survives. Do not edit installed
files. Third-party extensions run as your user, without a sandbox; inspect
their source and authorize live operations deliberately.

Offline syntax/fake-context/package tests do not establish real Resolve
behavior. Final product acceptance should use a fresh conversation and a real
tool request, followed by your own install, configure, search and run checks.
