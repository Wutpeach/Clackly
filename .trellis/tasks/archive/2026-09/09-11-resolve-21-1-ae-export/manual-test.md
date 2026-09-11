# Stage A user acceptance checklist

Use the final reviewed package named in the check report. Save your own work as you normally would and use a disposable test project where practical. The agent must not reset or save existing dirty user projects.

| Case | Action | Expected result |
| --- | --- | --- |
| Runtime readiness | Open Resolve 21.1 and the updated Clackly build; refresh AE export availability. | Qualified packaged Python 3.14.4 is selected; no RUNTIME_UNSUPPORTED error for 21.1.0.14. |
| Three modes | Invoke normal, audio-only and video-only through your existing entries/bindings. | All three remain available and retain their media behavior. |
| Explicit selection | Select two separated clips, including a cross-track example, leaving another clip unselected between them. | Only selected eligible clips reach AE, with relative positions/gaps preserved; the intervening clip is excluded. |
| Marker independence | Keep a Blue range Marker covering different content while exporting a non-empty selection. | Marker does not change the result. |
| Playhead fallback | Clear timeline selection, leave the Marker present, and put the playhead over known content; exercise all three modes. | Existing playhead targeting/media rules apply; Marker does not change the result. |
| Media mismatch | Select only video and invoke audio-only, or select only audio and invoke video-only, subject to actual linked-selection behavior. | No eligible selection yields the existing no-clips outcome; unrelated playhead content is not substituted. |
| Linked media and AE | Export a linked A/V selection with AE open; additionally try a cold start only in a suitable test context. | Existing linked-media behavior is preserved; actual AE layers, timing and imports are correct. |

Record failures with the case, command mode, selected items, expected/actual behavior and displayed error. Do not repeatedly retry a native crash; capture the diagnostic evidence first.

Stage B cleanup starts only after the user explicitly confirms this manual testing succeeded. Automated checks alone do not satisfy that gate.

## Acceptance record

The user explicitly reported “手测通过” after receiving the reviewed Stage A package. The manual acceptance gate is satisfied and the agreed Stage B cleanup has been dispatched. This records the user's acceptance, not an additional agent-observed live export.
