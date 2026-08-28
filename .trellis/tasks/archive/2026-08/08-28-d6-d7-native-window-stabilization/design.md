# D6/D7 Native Window Stabilization

## Scope

The work commit captures only the accepted standalone Windows dev-renderer composition. It does not claim Workflow, packaged Electron, or Resolve acceptance.

## Window contracts

- D6 main: persistent, opaque `#151619`, `240x320`, full-bleed renderer, native rounded corners/shadow, and immediate opacity `0/1` conceal/reveal. Native `show()` occurs only when the persistent window is initially hidden.
- D7 Panel: a persistent second opaque BrowserWindow to the main's right with a physical 16px gap. It is `focusable:false` at construction and never toggles focusability later. Open/close changes only allowed bounds, presentation, opacity, and mouse gating.
- Main blur: production behavior is unchanged. The D7-only stale guard returns only when a queued native focus-loss event arrives after `mainWindow.isFocused()` is already true; genuine unfocused blur follows the normal conceal route.

## Failure and motion policy

- A close with no detached-open state performs no native Panel or main mutation.
- Detached presentation failure restores main bounds and leaves the Panel opaque `0` and mouse-ignored.
- No scale, fade, visual blur, translation, or taskbar animation is a product feature. Opacity `0/1` is immediate lifecycle state for stability.

## Diagnostic retirement

The temporary JSONL recorder/analyzer was useful only to identify a queued stale native blur caused by redundant Panel mutations. Its conclusion is preserved in `evidence.md`; its runtime/test files and imports are removed before shipping the accepted behavior.
