# Current Resolve Startup Evidence

## Historical baseline

The archived `07-29-resolve-startup-freeze` task is the authoritative earlier investigation. It found historical `Loaded plugin:com.wutpeach.clackly` correlations with 12–29 second Resolve-log gaps, but four controlled post-project configurations were whole-GUI-freeze-negative. It also established that generic playhead stutter occurred with both Clackly entrypoints disabled and therefore is not a valid Clackly freeze signal.

## 2026-08-04 live session

- Resolve process start: `19:29:25`.
- Current project pointer: `19:30:07.392`.
- Resolve started the Clackly Workflow Electron process at `19:30:08`.
- Resolve logged Clackly plugin load at `19:30:08.930`.
- Resolve logged Workflow interface version 2 at `19:30:09.234`.
- The Clackly Electron main, GPU, network utility, and renderer processes were alive and `Responding=True` when inspected.
- No matching Windows Application Hang event was recorded for this interval.
- Resolve logs continued after interface readiness; they do not expose Clackly's internal window/renderer/hotkey milestones.

The available timeline proves that the native Workflow handshake completed quickly in this run. It does not prove whether Resolve's GUI message loop stalled briefly while Electron and Chromium children were created.

## Installed state

- ProgramData contains a packaged plugin directory, not the junction used by the archived sampler.
- Installed and repository `workflow-plugin/main.js` files have the same SHA-256: `438F9A2D31FF26B7C9DA46CC5688D054AABE2A27284930BF979C1B5428D92F67`.
- The old sampler's junction assertion and move/restore commands are obsolete for the current installed shape and must not be reused unchanged.

## Candidate boundary

The Workflow host creates a hidden palette BrowserWindow immediately after Workflow Integration initialization. In the observed run, Chromium GPU, network, and renderer children appeared in the same startup interval before the user invoked Clackly, but current evidence does not prove which children require the BrowserWindow. The official Resolve sample also creates a window eagerly, so laziness is not an official requirement; it is a product-specific A/B candidate that needs live evidence.

The minimum candidate is to keep the Workflow Electron process, Resolve initialization, IPC, lifecycle cleanup, and global shortcut registration at automatic startup while deferring only palette BrowserWindow/renderer creation until the first palette invocation. This is expected to defer the renderer and must measure, rather than assume, whether GPU or utility child-process creation also moves. No dependency or generic lifecycle framework is needed.

## Evidence limits

- Resolve's log gaps are correlation, not responsiveness measurements.
- Windows `Responding` sampling can miss short stalls.
- Current inspection occurred after the reported startup interval.
- The user must provide onset/recovery observations during the coordinated runs.
