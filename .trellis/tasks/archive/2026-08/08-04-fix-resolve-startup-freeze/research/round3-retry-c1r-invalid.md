# Round 3 strict retry C1R invalid observation and restoration

## Prepared state

- The user approved strict retry execution against B0 on 2026-08-05.
- The retry transaction used `C:\Users\Administrator\AppData\Roaming\Clackly Workflow Plugin.trellis-round3-retry-state-20260805-185801.json` and readiness token `20260805-185802-7A3D9F2B`.
- B0 aggregate proof before the move: SHA-256 `F8929578946217BA6BCFDF977DF9F50DA39F70B0241506EF4BFD3A86DFFCD64C`, 53 files, 20 directories, 8,880,285 bytes.
- The installed original `workflow-plugin/main.js` remained SHA-256 `438F9A2D31FF26B7C9DA46CC5688D054AABE2A27284930BF979C1B5428D92F67`.

## C1R sampling and observation

- The strict sampler published authoritative readiness before Resolve launched and then bound the newly launched Resolve process in `started.json`.
- Atomic completion `research/20260805-190102-C1R/run.json` matched run `C1R`, the readiness token, sampler PID/start time, Resolve PID/start time, expected absent profile, and exact 300s/100ms/2000ms settings.
- The user observed the entire Resolve GUI freeze approximately 9 seconds after the intended local project opened and recover around 13 seconds, for approximately 4 seconds.
- The responsiveness stream contained 2,996 samples. Requested cadence was 100ms; actual median was 94.648ms and the maximum interval was 4,538.968ms, from `19:06:55.2995399+08:00` to `19:06:59.8385084+08:00`. That gap begins approximately 9.7 seconds after the intended local project pointer at `19:06:45.556` and independently aligns with the user's observation.
- The sampler completed before the user closed Resolve and retained identity-bound output without target exit or PID drift.

## Strict invalidation

- The clean Resolve log offset first recorded `(Untitled Project)` from `KaiXin_2026_V1 : Network` at `19:06:43.868`, then `Local Database : Local`, then the intended `(Untitled Project 1)` / `Local Database : Local` pointer at `19:06:45.556`.
- Requirement 13 invalidates a run containing any network, different, missing, or manually switched project pointer. The network pointer therefore prevents C1R from counting as a causal C1 even though the stall and sampler evidence are strong.
- W1 and C2 were cancelled. No C1 identity was committed and no cold/warm profile-state conclusion was made.

## Mandatory restoration

- After the user closed Resolve normally, matching Resolve/Clackly process count was zero and the transaction journal had no pending operation.
- The generated C1R profile was retained without deletion at `C:\Users\Administrator\AppData\Roaming\Clackly Workflow Plugin.trellis-c1w1-20260805-185802`.
- The immutable B0 backup was atomically restored to the canonical path. Restored proof exactly matched SHA-256 `F8929578946217BA6BCFDF977DF9F50DA39F70B0241506EF4BFD3A86DFFCD64C`, 53 files, 20 directories, and 8,880,285 bytes.
- Final canonical profile state is a real, non-reparse directory; the immutable backup slot is absent; journal phase is `restored`; matching process count is zero.
- Final installed `workflow-plugin/main.js` SHA-256 remains `438F9A2D31FF26B7C9DA46CC5688D054AABE2A27284930BF979C1B5428D92F67`.

## Classification

The strict retry is **inconclusive/not-positive** because C1R violated the predeclared project-pointer gate. The freeze reproduction remains useful supporting evidence, but W1/C2 cannot proceed under the approved experiment. Exact B0 is restored, the generated profile is retained, and no product change ships.
