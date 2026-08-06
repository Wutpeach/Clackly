# Resolve Live Window Trace Findings

## Qualified Environment

- Windows build `10.0.26200`
- DaVinci Resolve `20.3.2.9`
- Resolve-bundled Electron `36.3.2`
- Workflow Integration package installed from `release/win-unpacked`

## Experiments

### 1. Native hide/show baseline

A gated JSONL trace recorded palette create, renderer load, show, focus, blur, and hide events. During a clean single invocation the window remained natively visible and focused until the user interacted elsewhere, yet the user still observed a whole-window flash. This excluded duplicate shortcut callbacks and an immediate blur-to-hide race as the cause of the show flash.

### 2. Background throttling disabled

Setting `backgroundThrottling: false` did not fix repeat invocation. The first-ever show after starting Resolve was clean, while the second and later shows flashed after the window had gone through native `hide()` / `show()`. The experiment was reverted.

### 3. Native-surface preservation

The palette was changed to remain natively visible after first show while logical hide uses opacity `0`, mouse pass-through, and non-focusability. Repeat reveal restores focusability, mouse input, opacity `1`, and focus without calling native `show()`.

The user verified that:

- repeat invocation no longer flashes;
- the concealed palette does not block mouse input;
- keyboard interaction works after reveal;
- the launcher orange shell outline is gone.

## Conclusion

The repeat flash was caused by Windows/Electron rebuilding the transparent BrowserWindow surface after native `hide()` / `show()`, not by renderer mode resizing, duplicate shortcuts, or a show-time blur race. Preserve the palette's native surface and represent hidden state through opacity/input/focus instead.

The Settings cyan outer edge remains a separate native-chrome issue and is not part of this palette lifecycle fix.
