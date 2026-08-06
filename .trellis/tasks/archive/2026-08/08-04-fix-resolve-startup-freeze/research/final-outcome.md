# Final outcome: Resolve startup freeze is not caused by Clackly

## Decision

The investigation ended on 2026-08-06 at the user's request. No speculative
Clackly startup change was shipped. The original packaged Workflow Integration
plugin was restored.

## Discriminating evidence

The same whole-Resolve GUI stall survived successively stronger removals:

1. Native Workflow Integration initialization deferred until first command.
2. Palette `BrowserWindow` and renderer deferred until first invocation.
3. Electron hardware acceleration disabled; the GPU child used SwiftShader.
4. A task-local minimal host loaded no Clackly modules, IPC, hotkeys, windows,
   renderer, native interface, AE code, timers, or network client.
5. The entire Clackly plugin directory was moved outside Resolve's Workflow
   Integration scan root, leaving zero Clackly manifests and no Clackly-owned
   Electron process.

The no-plugin H6 run still reproduced the symptom:

- local project pointer: `2026-08-06 11:44:41.792 +08:00`
- first non-responding sample: `11:44:54.498`
- last non-responding sample: `11:45:01.454`
- user observation: approximately project +13s through +23s
- Resolve CPU was the only sampled process consuming CPU in the interval
- no Clackly manifest, Electron host, renderer, GPU child, network child, or
  native Workflow Integration activity existed

Therefore Clackly is neither necessary nor the root cause of this stall.

## Remaining Resolve-side lead

Resolve is configured to use `V:\CacheClip` and `V:\.gallery`; `V:` is a
mapped network drive. Resolve logs `No reply received from file system` for
those locations during project opening. A project save also occurs near the
post-open interval in some runs. This makes Resolve's cache/gallery/save path
the leading follow-up area, but the task ended before a local-path A/B, so it
is a lead rather than a proven root cause.

## Restoration

- installed canonical plugin restored from the original retained directory
- restored `workflow-plugin/main.js` SHA-256:
  `438F9A2D31FF26B7C9DA46CC5688D054AABE2A27284930BF979C1B5428D92F67`
- exactly one Clackly manifest remains under the Workflow Integration scan root
- Resolve and matching Electron process count was zero at restoration
- repository product-source diff was returned to zero
- experimental plugin/profile backups were retained; nothing was deleted

