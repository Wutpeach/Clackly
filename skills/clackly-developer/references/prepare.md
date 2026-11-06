# Dynamic Prepare — #7-B accepted Host support

Implemented in this checkout, not a published release. Requires Command UI
version 2. The accepted #7-A Host rejects version 2 at installation. Earlier
pre-UI Hosts may ignore UI metadata: guard execute against missing context.phase
and required input. Never assume a manifest alone makes an old Host safe.

## Fixed manifest, per-run data

Keep the V1 extension manifest and command entry (.py). Use:

~~~json
{
  "id": "summary", "name": "Timeline summary", "entry": "summary.py",
  "ui": {
    "version": 2, "prepare": true,
    "inputs": {
      "timeline": {"type": "select", "label": "Timeline", "dynamic": true, "required": true},
      "title": {"type": "string", "label": "Report title", "default": "Summary"}
    }
  }
}
~~~

ui.version:2 requires prepare:true; version 1 stays unchanged. dynamic:true is
only for select in version 2. Omit its static options and default; Prepare must
supply an array (including empty) for every dynamic select. Static selects keep
string options. Other fields retain all #7-A constraints. Prepare cannot create
fields, change types/rules/layout or return UI code. Optional ui.confirm works
exactly as in [Command UI](command-ui.md).

## Python callbacks

The same entry exports prepare(context) and execute(context). Clackly chooses
the callback; the renderer never names a function or script. context.phase is
prepare or execute. Prepare receives empty context.input and saved context.config.
context.resolve exposes the same trusted connection. Use documented Resolve API,
never Clackly internals. Keep host calls inside callbacks, not module import.

~~~python
def prepare(context):
    return {
        "$clackly": "prepare", "version": 1,
        "options": {"timeline": [
            {"label": "01 · Main edit", "value": "stable-project-and-timeline-id"}
        ]},
        "defaults": {"timeline": "stable-project-and-timeline-id", "title": "Current edit"},
        "message": "Choose a timeline; refresh after the project changes."
    }

def execute(context):
    if getattr(context, "phase", None) != "execute" or not context.input.get("timeline"):
        raise ValueError("This command requires a Host with Dynamic Prepare support.")
    # Requery the current project and resolve EXACT stable IDs from input.
    # If missing or in another project, fail; never select another timeline.
    return {"$clackly": "result", "version": 1, "status": "success",
            "message": "Summary ready", "text": "..."}
~~~

Only $clackly, version, options, defaults, message are accepted. Options maps
declared dynamic select keys to arrays of {label,value}: both nonblank strings
up to 200 characters, values unique per field, at most 100 entries per field.
Labels may repeat; include index/ID when names collide. Defaults may target any
declared field and must satisfy original type, bounds and candidate membership.
Omit absent defaults; do not use null or empty string. Optional message is plain
text up to 2,000 characters. The whole serialized envelope is at most 65,536
characters. Unknown keys, extra schema and missing dynamic arrays fail closed.

## Lifecycle, refresh and safety

Prepare and Execute each use a separate bounded short-lived Python worker
(10 seconds each; existing 1 MiB stdout/stderr limits). Workers exit before
results are shown. Filling a form has no worker or timer. Only submission runs
Execute. No persistent process, polling, field dependency, streaming, RPC,
cross-command cache or in-flight Execute cancellation.

Loading can close to stop waiting; the bounded worker may finish in the
background and its late result is discarded. This is not cancellation of code.
Failed/Timeout can retry. A required dynamic field without options shows Empty
and blocks Execute; optional empty options alone do not. Refresh runs Prepare
once. Legal edited values (including false and cleared optional values) survive.
A previous selection missing from new options is cleared with a notice, even
when Prepare proposes another default. Confirmation resets after refresh.
Prepare defaults initialize unedited fields.

Host binds candidates to installation revision, command and saved configuration;
Replace, disable/uninstall or config changes invalidate them. Submissions must
match current candidates. Host cannot guarantee Resolve objects stay valid:
Execute must requery project/target identity and applicability, explaining a
deleted/switched target without substituting another. Use stable IDs rather
than display names or current indices. Check API availability and fail clearly
if stable identity cannot be established.

Prepare is intended for read-only queries, but third-party Python runs with user
permissions and has no OS sandbox. Confirmation and callback names enforce no
read-only permission. Live Resolve testing remains with the user unless
explicitly authorized. Only Python extensions are currently supported.
