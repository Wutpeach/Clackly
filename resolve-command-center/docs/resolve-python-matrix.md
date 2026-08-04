# Resolve/Python compatibility matrix

Compatibility is evidence-based; sharing a Python `3.13.x` family is not proof.

| Runtime | Resolve | Status | Evidence |
| --- | --- | --- | --- |
| CPython 3.13.14 x64 | 20.3.2.9 | candidate, blocked | Official ZIP hash passed; staged and packaged identity returned 3.13.14/64bit; isolated bridge import reached connection and returned `RESOLVE_NOT_RUNNING` because Resolve was not running. No real export evidence. |
| CPython 3.13.1 x64 | 20.3.2.9 | historical only | Phase 6.5C previously verified bridge import and Resolve connection on this machine. It has not passed the 6.5D final-package/export sequence and is not selected. |

## Qualification required for promotion

1. Execute packaged `runtime-info` and retain executable/version/architecture inventory.
2. With Resolve running, force one isolated Probe and then repeat for a cache hit.
3. Launch the final unpacked package through Resolve Workflow Integration.
4. Perform a real Export to After Effects send and retain sanitized result/log evidence.
5. Repeat with system Python unavailable, Python removed from `PATH`, Conda active,
   and `PATH` pointing at Python 3.11.

Only then promote 3.13.14 to `current`. If it fails, pin the official 3.13.1 asset and
repeat every packaged check; use `legacy-pinned` only after complete success and link a
P1 security-upgrade blocker. If neither passes, leave the release incomplete.

