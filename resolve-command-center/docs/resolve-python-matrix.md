# Resolve/Python compatibility matrix

Compatibility is evidence-based; sharing a Python `3.13.x` family is not proof.

| Runtime | Resolve | Status | Evidence |
| --- | --- | --- | --- |
| CPython 3.13.14 x64 | 20.3.2.9 | candidate, blocked | Official ZIP/package identity passed; packaged Probe miss then hit connected to Resolve 20.3.2.9; Resolve loaded the final packaged Workflow Integration; one managed `RuntimeManager` send returned `exported` for one selected video clip and the user separately confirmed the real AE result. A hostile no-PATH run exposed AE being launched with the worker allowlist, causing Preferences/CEP errors and exit; the host-owned launch fix is automated-green but not yet live-retested. |
| CPython 3.13.1 x64 | 20.3.2.9 | historical only | Phase 6.5C previously verified bridge import and Resolve connection on this machine. It has not passed the 6.5D final-package/export sequence and is not selected. |

## Qualification required for promotion

1. Execute packaged `runtime-info` and retain executable/version/architecture inventory.
2. With Resolve running, force one isolated Probe and then repeat for a cache hit. *(Passed.)*
3. Launch the final unpacked package through Resolve Workflow Integration. *(Passed.)*
4. Perform a real Export to After Effects send and retain sanitized result/log evidence. *(Passed before the host-launch regression fix; repeat once after packaging the fix.)*
5. Repeat with system Python unavailable, Python removed from `PATH`, Conda active,
   and `PATH` pointing at Python 3.11.

Only then promote 3.13.14 to `current`. If it fails, pin the official 3.13.1 asset and
repeat every packaged check; use `legacy-pinned` only after complete success and link a
P1 security-upgrade blocker. If neither passes, leave the release incomplete.
