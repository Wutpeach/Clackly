# Fix Image Clipboard click execution

## Goal

Make the visible `Paste Clipboard Image` command execute when the user activates its card with a normal mouse left-click, so the shipped Image Clipboard feature is usable from the Clackly palette.

## Background

- The Workflow plugin and Clackly palette start successfully.
- A physical left-click is routed through `electron/renderer/App.jsx` to `InteractionManager`.
- The shipped bindings contain left-click actions for Marker and Export to After Effects, but none for `media.clipboard-image.import`.
- An unmatched click returns `{ matched: false }`, producing no command execution, no error, and no PNG under the configured save root.
- Keyboard activation already routes directly to command execution and must remain supported.

## Requirements

- A normal unmodified left-click on `Paste Clipboard Image` must execute `media.clipboard-image.import` exactly once.
- Existing Marker and Export to After Effects bindings, including modified-click variants, must keep their current behavior.
- The fix must work for existing installed users whose `bindings.json` predates Image Clipboard; it must not rely only on defaults written for a fresh profile.
- Clipboard, filesystem, Resolve Media Pool, error, and transaction behavior implemented by the Image Clipboard capability must remain unchanged.
- Do not change Workflow startup visibility, add Timeline insertion, or introduce a new interaction/command framework.

## Acceptance Criteria

- [x] Physical left-click on the Image Clipboard card reaches the standard command executor once.
- [x] Existing profiles without an Image Clipboard binding gain working left-click behavior.
- [x] Clipboard-empty execution surfaces the existing `clipboard-image-not-found` error instead of silently doing nothing.
- [x] Successful execution writes a PNG and continues through the existing Resolve import path.
- [x] Existing interaction bindings and keyboard activation regressions pass.
- [x] Relevant focused tests and the full repository regression suite pass.
- [x] The Workflow package is rebuilt, verified, and installed only after Resolve is closed.
