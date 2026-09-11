# Resolve/Python compatibility matrix

Compatibility is evidence-based; matching a major/minor family is not proof.

| Runtime | Resolve | Status | Evidence |
| --- | --- | --- | --- |
| CPython 3.14.4 x64 | 21.1.0.14 | current | Official ZIP/Sigstore/SPDX/license hashes are locked. One forced, isolated managed Probe passed with Resolve's 21.1 bridge module and `fusionscript.dll`; it connected to Resolve and verified the exact host version. Package identity verification and the user manual selected-item/playhead AE-import matrix passed. |
| CPython 3.13.14 x64 | 20.3.2.9 | legacy-pinned | Previous official ZIP/package identity, hostile Python-environment package verification, packaged Probe miss/hit, final Workflow Integration loading, and live warm/cold exports passed. It remains supported without matching Resolve 21.1. |
| CPython 3.13.1 x64 | 20.3.2.9 | historical only | Phase 6.5C previously verified bridge import and Resolve connection on this machine. It has not passed the 6.5D final-package/export sequence and is not selected. |

## Qualification evidence

1. Execute packaged `runtime-info` for every profile and retain executable/version/architecture inventory.
2. With Resolve running, force one isolated Probe with the profile's explicit vendor module/library, then repeat for a cache hit. CPython 3.14.4 / Resolve 21.1.0.14 passed the forced Probe.
3. Launch the final unpacked package through Resolve Workflow Integration and verify both exact profile identities.
4. Perform a real Export to After Effects send in a disposable/user-approved context. For 21.1 this covers non-empty selected items, empty-selection playhead fallback, and running/cold AE imports.
5. Verify the exact packaged Runtime and Probe contract with system Python unavailable, Python removed from `PATH`, Conda active, and `PATH` pointing at Python 3.11.

CPython 3.14.4 is selected only for the exact Resolve `21.1.0` version prefix proven
by the isolated Probe; unsupported versions remain explicit. CPython 3.13.14 remains
the qualified 20.3.2 profile. The 21.1 selected-item/playhead and AE-import checklist
passed before the Marker-export cleanup.
