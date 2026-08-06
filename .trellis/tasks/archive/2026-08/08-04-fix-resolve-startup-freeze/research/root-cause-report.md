# Resolve startup freeze investigation result

## Outcome

No production fix ships from this experiment. The original ProgramData plugin and repository product source were restored and verified.

## What reproduced

- U0 uninstrumented eager startup reproduced the whole-Resolve GUI stall.
- A1 equally traced eager startup reproduced it again with successful shortcut registration.
- B1 traced lazy startup also exhibited a whole-GUI stall before any palette BrowserWindow existed.

## What the evidence excludes

- The saved AE path check is not the historical cause and took approximately 2ms in A1.
- Eager palette BrowserWindow construction and renderer loading are not required for the B1-observed stall: B1 became unresponsive around `10:46:30`, while the first BrowserWindow was created only after user invocation around `10:47:11`.
- The lazy-window candidate therefore did not demonstrate the predeclared binary improvement and cannot ship.

## Causality limit

B1 had an extra network-project pointer transition before the local test project, unlike U0/A1. This violates the strict same-project-open-path condition, so the A/B outcome is inconclusive rather than a complete root-cause proof. The evidence still establishes that the B1 stall did not require a palette window or renderer.

## Remaining boundary

The unresolved boundary is earlier than palette creation: Resolve-owned Electron host launch, app readiness, or the native Workflow Integration handshake and its delayed interaction with project loading. A future experiment should predeclare one of those boundaries, control the exact project-open path, and use the same A-B-A gate. It must not reintroduce the disproven lazy-window change as a production fix.

## Restored state

- Canonical ProgramData plugin is a real directory, not a reparse point.
- Exactly one Clackly manifest exists under the Workflow Integration Plugins scan root.
- Restored `workflow-plugin/main.js` SHA-256: `438F9A2D31FF26B7C9DA46CC5688D054AABE2A27284930BF979C1B5428D92F67`.
- Restored inventory: 4316 files, verified against the pre-A1 backup inventory.
- Repository product files have zero Git diff.
- Temporary product tracing and lazy-lifecycle code were removed. Research copies of A1/B1 traces remain as intentional diagnostics.

## Round 2 baseline gate

Round 2 did not proceed to native-initializer artifacts because the strict original C0 baseline was negative.

- P0 preconditioning used only local `(Untitled Project 1)` and the user observed a whole-GUI stall around 30 seconds after project open.
- The immediately following C0 again used only that local project/database identity, but the user continuously interacted for approximately two minutes without a whole-GUI stall.
- C0's Windows `Responding=False` interval occurred before the project pointer and is not the target post-project symptom.
- This P0-positive/C0-negative sequence shows that the current baseline is intermittent or sensitive to cold/warm/transient state.
- Per the approved gate, no trace-v2 A1, H1, A2, or H2 product artifact was created or installed. The restored original plugin and zero product-source diff remain unchanged.
