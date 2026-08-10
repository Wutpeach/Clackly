# Migrate Toolbox Image Clipboard

## Goal

Add a standard Clackly command named `Paste Clipboard Image` that reads one image from the Electron host clipboard, persists a collision-safe PNG under the user's Pictures directory, imports it into the current Resolve project's root-level `Clipboard` Media Pool bin, and restores the user's original Media Pool folder.

## Background

- The product behavior is informed by `D:/Toolbox/modules/ImageClipboard.svelte`, but Clackly must not copy Toolbox's module or DataStore architecture.
- Clackly already routes commands through Command metadata, Capability registration, the shared Composition Root, host adapters, and Resolve adapters.
- The repository currently has no Clipboard adapter or Media Pool import adapter.

## Requirements

1. Register one visible Command with id `media.clipboard-image.import`, display name `Paste Clipboard Image`, and a normal Clackly Capability metadata record.
2. Electron Hosts own Clipboard access and inject PNG bytes through a Core-safe adapter; Core code must not import Electron.
3. Save a real PNG beneath `<Pictures>/Clackly Clipboard/<sanitized project name>/` using `Clipboard_<YYYY-MM-DD>_<HHmmss>_<milliseconds>.png` plus a collision-safe suffix when needed.
4. Centralize default configuration as `saveRoot`, `binName`, and `organizeByProject`; do not expand the Settings architecture for MVP.
5. Sanitize project names for Windows-illegal characters, reserved names, traversal segments, trailing spaces/dots, and empty names; fallback to `Untitled Project`.
6. Verify the resolved output remains inside `saveRoot`; no project name may inject an absolute path or escape the root.
7. Find or create a direct child bin named `Clipboard` under the Media Pool root, temporarily make it current for import, and restore the original folder in cleanup even when import fails.
8. Keep a successfully written PNG when later Resolve work fails. A disk failure must happen before any import call.
9. Return success with at least `diskPath`, `mediaPoolBin`, and `projectName`; restoration failure after successful import is a warning, not a failed import.
10. Throw structured business/runtime errors with stable `code` and diagnostic `details`; `clipboard-image-not-found` must create no file.
11. Support both current Resolve access paths: direct Workflow Integration and the existing standalone bridge adapter. Do not add a runtime or execution framework.

## Acceptance Criteria

- [x] Clipboard image bytes produce a PNG in the expected project directory, creating missing directories.
- [x] Empty/non-image Clipboard produces `clipboard-image-not-found` and no file.
- [x] Project names are safely sanitized, including traversal and Windows reserved-name cases.
- [x] Rapid executions cannot select the same path.
- [x] Existing root-level `Clipboard` bin is reused; a missing bin is created.
- [x] Successful import restores the original Media Pool folder.
- [x] Failed import still restores the original folder and leaves the PNG on disk.
- [x] Disk write failure never calls Resolve import.
- [x] Missing Resolve/project/Media Pool and bin/import failures retain structured errors.
- [x] Restore failure logs a warning and, after a successful import, returns success with diagnostics.
- [x] Command and Capability metadata are discoverable through existing registries.
- [x] Automated Node/Python tests cover the required transaction, security, registration, and adapter behavior without real Resolve.
- [x] Relevant regression tests and the full project test suite pass.
- [x] Architecture audit confirms Electron imports remain in Host code and no new Command/runtime framework exists.

## Out of Scope

- Paste to Timeline or playhead placement.
- Clipboard history, multiple images, non-image/file/URL/video Clipboard data, OCR, image editing, compression, or alternate formats.
- Image Browser or Toolbox-style module UI.
- A new plugin runtime, Command Engine, execution framework, or broad Settings refactor.

## Blocking Open Questions

None. The user supplied product behavior, defaults, failure semantics, security constraints, and scope boundaries.
