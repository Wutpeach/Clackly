# Round 3 C1 invalid observation and restoration

## Prepared state

- The user approved the reviewed Round-3 cold/warm profile experiment on 2026-08-05.
- `research/profile-experiment.py` passed `py_compile` and 15 task-created transaction/recovery fixtures.
- Independent Orca Worker developer audit and re-audit both concluded `SAFE TO PREPARE`; the orphaned-original guard identified in the first audit was fixed before O0.
- O0 atomically renamed the original canonical profile to the immutable sibling backup `C:\Users\Administrator\AppData\Roaming\Clackly Workflow Plugin.trellis-original-20260805-140441`.
- Original aggregate tree proof: SHA-256 `C22601109C0536D52C0FA7CD668ECE8E22CC07CD966DAEE0F91B8A7AB128FA18`, 51 files, 20 directories, 8,839,556 bytes.
- The repository product source and installed original ProgramData plugin remained unchanged. Installed `workflow-plugin/main.js` SHA-256 remained `438F9A2D31FF26B7C9DA46CC5688D054AABE2A27284930BF979C1B5428D92F67`.

## Invalid C1 attempt

- The first C1 sampler (`research/20260805-140508-C1`) waited 300 seconds and exited because Resolve was not launched during its window. It contains preflight/plugin inventory only and no responsiveness run.
- A later C1 sampler attempt (`research/20260805-181101-C1`) rejected the run immediately because Resolve was already running when the sampler preflight executed. It also contains preflight/plugin inventory only and no responsiveness run.
- During that uninstrumented cold-profile launch, the user observed a whole-GUI stall approximately 4 seconds after project open; it recovered after approximately 2–3 seconds.
- The direct observation is retained as supporting evidence, but the run violates the equal-sampler gate and cannot count as causal C1.
- Per the active critical constraint, W1/C2 were cancelled and no profile-state conclusion or product-fix claim was made.

## Mandatory restoration

- After the user closed Resolve normally, no matching Resolve/Clackly process remained.
- The generated cold profile was transactionally retained without deletion at `C:\Users\Administrator\AppData\Roaming\Clackly Workflow Plugin.trellis-c1w1-20260805-140441`.
- The immutable original backup was atomically renamed back to the canonical profile path.
- Restored aggregate tree proof exactly matched O0: SHA-256 `C22601109C0536D52C0FA7CD668ECE8E22CC07CD966DAEE0F91B8A7AB128FA18`, 51 files, 20 directories, 8,839,556 bytes.
- Final canonical profile attributes: real `Directory`, not a reparse point. The former immutable-backup path is absent because the same directory identity was renamed back.
- Final installed `workflow-plugin/main.js` SHA-256: `438F9A2D31FF26B7C9DA46CC5688D054AABE2A27284930BF979C1B5428D92F67`.
- Final matching Resolve/Clackly process count: 0.
- The transaction journal remains at its known sibling state path with phase `restored`; it was not deleted.

## Classification

Round 3 is **inconclusive/not-positive**. The cold-profile observation is notable, but the required sampler was absent. No product change ships, and no retained experimental profile is deleted without separate user approval.
