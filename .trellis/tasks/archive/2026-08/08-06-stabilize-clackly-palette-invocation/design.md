# Technical Design

## Boundary

The first repair boundary is the shared Electron window helper plus the narrow preload/renderer mode path. The command engine, Resolve capability layer, Settings window, and launcher layout remain unchanged.

## Root-Cause Model

The palette currently has a fixed size but behaves as though each renderer mode owns a different native footprint:

`hotkey -> set mode/size/center -> set always-on-top -> show -> focus -> palette:shown -> React mode reset -> palette:set-mode -> set size/center again`

The window-level `blur -> hide -> clear always-on-top` path can interleave with those focus and native-style changes. The design removes the redundant transitions instead of coordinating them with a new state machine.

## Minimal Invocation Contract

1. Construct the palette once at `376x468`, centered, frameless, fixed-size, skipped from the taskbar, and configured with its visible always-on-top policy.
2. Renderer mode remains renderer state because all modes share one footprint. Remove `palette:set-mode`, `setPaletteMode`, `PALETTE_SIZES`, and `setPaletteWindowMode` if repository search confirms they have no other behavioral consumer.
3. Showing performs one visibility/focus transition and one `palette:shown` notification. Do not call native size, position, or style mutators on every show.
4. Hiding only hides the window. It does not mutate an irrelevant hidden window's topmost style.
5. Keep the existing immediate blur-to-hide rule initially. Add a small focus-armed blur guard only if Resolve event evidence still shows a transient blur generated inside the invocation sequence.

## Focus and Chrome Classification

Add an explicit no-outline rule only for the programmatically focused, non-interactive `.palette-shell`. Existing control-level focus-visible rules remain authoritative.

Validation uses two views:

- renderer capture: proves whether CSS/focus paint owns the edge;
- complete desktop/window capture: proves whether the edge is outside renderer bounds and therefore owned by Windows DWM.

No native dependency is added in this task. A failing second capture is evidence for the separately planned native-chrome follow-up.

## Native-Chrome Follow-up Boundary

If DWM remains the confirmed owner, this task records the reproduction, complete-window capture, qualified OS/Resolve/Electron versions, and renderer comparison in task research, then creates a separate follow-up for native suppression. That follow-up can compare a small Node-API binding with a separately packaged helper without coupling that build-system decision to the JS/CSS lifecycle repair.

## Compatibility and Rollback

- Qualified host remains Resolve 20.3.2.9 with Electron 36.3.2.
- Standalone and Workflow hosts continue importing the same helper.
- The core rollback is deletion/restoration around window lifecycle, preload IPC, renderer reset, tests, and the frontend spec.
- Any future native fallback must be independently removable so the JS/CSS lifecycle repair remains valid.
