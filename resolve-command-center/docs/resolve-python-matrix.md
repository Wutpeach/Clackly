# Resolve/Python compatibility matrix

Compatibility is evidence-based; sharing a Python `3.13.x` family is not proof.

| Runtime | Resolve | Status | Evidence |
| --- | --- | --- | --- |
| CPython 3.13.14 x64 | 20.3.2.9 | current | Official ZIP/package identity, hostile Python-environment package verification, packaged Probe miss/hit, and final Workflow Integration loading passed. Automated tests prove AE launches from the host desktop environment, and the host-owned fix passed live warm and cold exports without the prior Preferences/CEP errors. |
| CPython 3.13.1 x64 | 20.3.2.9 | historical only | Phase 6.5C previously verified bridge import and Resolve connection on this machine. It has not passed the 6.5D final-package/export sequence and is not selected. |

## Qualification evidence

1. Execute packaged `runtime-info` and retain executable/version/architecture inventory.
2. With Resolve running, force one isolated Probe and then repeat for a cache hit. *(Passed.)*
3. Launch the final unpacked package through Resolve Workflow Integration. *(Passed.)*
4. Perform a real Export to After Effects send and retain sanitized result/log evidence.
   *(Passed after the host-launch fix with AE already running and with AE closed.)*
5. Verify the exact packaged Runtime and Probe contract with system Python unavailable,
   Python removed from `PATH`, Conda active, and `PATH` pointing at Python 3.11, while
   separately proving host-environment AE launch and real warm/cold sends. *(Passed.)*

CPython 3.13.14 passed the composed release matrix and is selected as `current`. The
historical 3.13.1 fallback was not needed and remains unselected; no legacy
security-upgrade blocker is required.
