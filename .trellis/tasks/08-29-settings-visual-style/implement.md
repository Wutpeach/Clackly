# Settings Visual Alignment Implementation Plan

## 1. Preparation

- Load `trellis-before-dev`, the frontend quality spec, root `DESIGN.md`, the task research, and Impeccable `craft-floor` before editing UI.
- Record the current Settings-specific file diff and preserve unrelated work.
- Confirm the active task is `.trellis/tasks/08-29-settings-visual-style` before dispatching implementation to the existing `develop` Orca Worker.
- Treat the first orange-wash/legacy Settings pass as rejected. Current Palette and Interaction Information paint, not the old Settings sample, is the implementation authority.

## 2. Evidence Fixture First

- Add explicit hostless Settings fixture variants for General/empty, typical ready, missing-config with long path, Simplified Chinese multi-help, busy, and error states.
- Keep the fixture renderer-local, cloned, nonpersistent, and non-executable.
- Add focused tests proving the fixture is opt-in and cannot become registry/preload/IPC/Resolve authority.
- Add or extend the headless evidence path to capture Settings at `760x560` without launching Electron or Resolve.

## 3. Token and Paint Alignment

- Update `DESIGN.md` and `.impeccable/design.json` before renderer paint so native-window independence is explicitly distinct from the shared visual language.
- Introduce the task-owned `--settings-*` projection layer using current Palette/Interaction primitives rather than token-renaming the legacy Settings surface.
- Replace Settings use of legacy opaque tile/hover/tooltip authorities with continuous `#151619` ink, shared `rgba(255,255,255,0.052)` hover, Palette inset controls, weak hairlines, and Interaction keycaps.
- Normalize sidebar/category/detail/field/help/feedback typography to the task design roles.
- Keep the two-pane geometry and fixed action-footer topology unchanged.
- Update navigation rest/hover/selected/focus/warning states with exact Palette selection (`#E7E8EA` / `#17191D`), no orange wash/location rail, and monochrome `16px` icons.
- Replace the large accent detail icon tile with a compact `14–16px` monochrome header icon.
- Flatten the branded/gradient titlebar, framed lifecycle card, loose control stack, and tall app footer into one compact continuous instrument hierarchy without changing topology.
- Render Interaction Help input labels as read-only keycap/chip primitives.
- Remove the footer's upward ambient shadow and legacy titlebar gradient while preserving drag/close/native behavior.
- Remove or correct only proven dead Settings-owned layout rules, including the unreachable fixed-window media query and ineffective field maximum.

## 4. Focused Regression Coverage

- Preserve existing Settings behavior, localization, selection, lifecycle, schema control, save/reset, and window-contract tests.
- Update CSS paint assertions only when they intentionally encode the new Settings rule.
- Add focused presentation/source tests for exact shared selection colors, `14–16px` icon treatment, continuous titlebar/lifecycle/footer paint, compact row/control rhythm, keycap help, and absence of structural redesign selectors.
- Run targeted renderer/main tests during iteration.

## 5. Bounded Visual Review

- Build once, then capture the complete Settings state matrix at `760x560` in one headless batch.
- Inspect the batch together and compare representative Settings frames with current Palette/Interaction evidence for continuous surface, neutral selection, flat status, inset fields, compact footer, clipping, long-path wrapping, bilingual density, focus, disabled/busy contrast, and reduced motion.
- Apply one batched correction pass for all material findings.
- Rebuild and capture one confirmation batch; stop polishing after the confirmation pass.
- Run the Impeccable detector once on changed UI targets and fix only mechanical in-scope findings.

## 6. Quality Gate

- Run focused Settings/browser-preview/window tests.
- Run `npm test`.
- Run `npm run build`.
- Run the task's headless Settings evidence command.
- Run `git diff --check` and boundary searches proving no IPC/config/Resolve/native-window/Palette authority changed.
- Lead reviews the Orca Worker diff and evidence before reporting completion.

## Risk and Rollback Points

- If hostless fixtures leak outside an explicit Settings preview query, remove the fixture path before continuing.
- If the fixed footer clips or moves, revert the geometry change and keep the task visual-only.
- If Settings behavior or native window tests change for reasons unrelated to paint, roll back that portion rather than broadening scope.
- Do not launch Electron or Resolve for automated visual review; browser evidence is renderer-only.

## Visual Evidence Review (2026-08-29)

- Redesigned batch: `evidence/settings-redesign-batch-1/`; correction batch: `evidence/settings-redesign-correction/`; confirmation batch: `evidence/settings-redesign-confirmation/`. Each contains General/empty, typical-ready, missing-config-long-path, zh-CN-multi-help, busy, error, and reduced-motion `760×560` captures plus its JSON report.
- Compared the confirmation `settings-typical-ready.png` and `settings-zh-cn-multi-help.png` against `../archive/2026-08/08-28-localization-foundation/evidence/palette-en-final-rerun/default.png` and `interaction-panel.png`. The shared continuous `#151619` ink, weak hairlines, light-neutral selected anchor with dark monochrome icon, `16px` icon scale, inset control fill, subdued metadata, Interaction keycaps, and small action rhythm now read as one current-generation system.
- The bounded correction changed only the visual scan path: Feature Status became an inline flat readout and the General empty state became a local detail continuation. No topology, fixture, feature, schema, localization, IPC, persistence, or native-window behavior changed.
- Browser screenshots establish renderer paint only. They do not establish native Electron transparency/DWM/taskbar/focus behavior or Resolve behavior.
