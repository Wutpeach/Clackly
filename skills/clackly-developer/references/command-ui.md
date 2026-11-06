# Command UI — #7-A accepted Host support

Implemented in this source checkout; not a promise about the user's installed
Host or a published release. Verify Host support before relying on it. Older
Hosts ignore unknown Command fields. Never use that to run a risky command
without its required confirmation. No custom UI or extra frontend code.

The complete read-only [Run Summary example](../examples/run-summary/manifest.json)
and [Python entry](../examples/run-summary/summary.py) exercise all input types,
confirmation, persistent settings, short notifications and structured details.

## Static input and confirmation

Put optional `ui` on a command in the existing V1 manifest:

~~~json
{
  "id": "summarize", "name": "Summarize selection", "entry": "summarize.py",
  "ui": {
    "version": 1,
    "inputs": {
      "title": {"type": "string", "label": "Title", "description": "Name for this report", "placeholder": "Review", "default": "Review", "required": true},
      "notes": {"type": "text", "label": "Notes", "placeholder": "Optional notes"},
      "count": {"type": "number", "label": "Copies", "default": 1, "required": true, "min": 1, "max": 5},
      "include_names": {"type": "boolean", "label": "Include names", "default": false},
      "mode": {"type": "select", "label": "Mode", "options": ["Brief", "Detailed"], "default": "Brief"},
      "color": {"type": "color", "label": "Color", "default": "#63c174"},
      "source": {"type": "path", "label": "Source file"},
      "destination": {"type": "folder", "label": "Destination folder"}
    },
    "confirm": {"message": "This command writes the report to the selected destination."}
  }
}
~~~

`inputs` may be omitted for confirmation only; `confirm` may be omitted for
ordinary input. An empty `ui` is invalid. No `ui` means direct execution.
`string` is single line; `text` is multiline; `path` selects an existing file;
`folder` selects an existing directory. Both allow typing a path. Business code
must check that paths exist/are suitable before using them. All fields require
a nonblank `label`. Optional `description`, `placeholder`, `default`, `required`;
`min`/`max` only for finite numbers; `options` is a static array of unique strings.
Boolean `required` means a value must be supplied, and `false` is valid; use
`confirm` when positive user confirmation is required. Color is `#RRGGBB`.

Up to 20 fields; keys `^[a-zA-Z][a-zA-Z0-9_]{0,79}$` excluding `constructor`
and `prototype`. Labels 120 characters; descriptions/placeholders/confirmation
2,000; select options 100 entries of up to 200 characters. Input values 8,192
characters each and serialized input object 32,768 characters. Unknown UI,
field and result keys are rejected. Optional version 2 Prepare is documented
in [Dynamic Prepare](prepare.md); do not mix dynamic declarations into version 1.
No RPC or execution cancellation.

Host validates types, required fields and numeric bounds before starting
Python. Cancel/close starts no script. Defaults initialize a new session;
submitted inputs are not persisted, are not settings, and arrive only as
`context.input`. `context.config` remains saved settings. User think time is
outside the existing Python execution limit. Confirmation is user consent to
that action, not a sandbox, permission system or proof of script safety.

## Explicit results

~~~python
def execute(context):
    title = context.input["title"]
    return {
        "$clackly": "result", "version": 1, "status": "success",
        "message": "Report ready",
        "text": title,
        "fields": [{"label": "Mode", "value": context.input.get("mode", "Brief")}],
        "items": ["First entry", "Second entry"]
    }
~~~

Only `$clackly: "result"` opts into UI. Version exactly 1; status `success` or
`error`; nonblank `message` required (2,000 characters). Optional `text` and
`diagnostic` each 32,768; `fields` up to 50 `{label, value}` pairs (label 120,
value string 2,000); `items` up to 100 strings of 2,000 characters. The whole
serialized envelope is at most 65,536 characters. Return strings for values,
not arbitrary Python objects. HTML/Markdown is displayed as literal text.

Success with a single-line message of at most 60 characters closes the temporary
dialog and shows a brief notification. Longer/multiline messages and data keep a
scrollable/copyable result window. `status: "error"`
keeps a failure window; `diagnostic` is collapsed technical detail. Raised
exceptions, malformed explicit results and runtime timeouts produce failures.
Commands without inputs can return this envelope too. Unmarked legacy JSON
and logs do not become UI; a legacy return after an input command gets a
generic completion notification. No mid-execution interaction, streaming,
background work or real cancellation. Keep formal Python work under 10 seconds.
