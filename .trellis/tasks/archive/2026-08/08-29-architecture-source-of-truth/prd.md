# Restore architecture source of truth

## Goal

Restore one unambiguous documentation source of truth for the accepted D6/D7 Palette architecture. README, DESIGN, and the frontend Trellis spec must describe the Windows native dual-window contract and the browser preview's limited hostless role exactly as the current production code and the approved D6/D7 task artifacts do.

## Background and confirmed facts

- The approved Windows contract is recorded in `.trellis/tasks/archive/2026-08/08-28-d6-d7-native-window-stabilization/` and `.trellis/tasks/archive/2026-08/08-28-workflow-native-dual-window/`.
- Current production code selects D6/D7 for both Windows native hosts through `electron/main/paletteHostPolicy.js`: an opaque fixed `240x320` main Palette plus a separate opaque `260px` Interaction Panel with a real `16px` desktop gap. Windows D6/D7 do not use `setShape`; the transparent attached shaped-window model remains only as the non-Windows compatibility fallback.
- `electron/shared/palette-geometry.json` is the shared geometry/visual-token authority. The root browser preview consumes that contract as an isolated, non-executable DOM simulation; it is not registry, preload, IPC, HWND, DWM, focus, hit-testing, z-order, packaged-runtime, or Resolve authority.
- `resolve-command-center/README.md` contains four stale or misleading claims: the root browser preview returns an empty catalog; renderer evidence is framed around Electron `setShape` validation; Windows Interaction Panel uses one `516x320` shaped BrowserWindow envelope with thick frames disabled; and Resolve host validation is described as proving native borders are absent.
- `DESIGN.md` already describes the native two-window model. Its general registered-metadata rule should explicitly state the narrow root-preview representative-data exception so the authority hierarchy remains unambiguous.
- `.trellis/spec/frontend/quality-guidelines.md` already contains the detailed accepted contract with no old D6/D7 residue found in the live spec. The frontend spec index still labels that populated authority as `To fill`, weakening discoverability and source-of-truth status.

## Requirements

- Update documentation only. Do not modify production code, tests, dependencies, generated assets, window options, IPC, renderer behavior, or packaging/install behavior.
- Replace every live README statement that presents Windows as one attached `516x320` BrowserWindow or permits Windows D6/D7 `setShape` with the accepted native dual-window model. Keep the attached shaped-window contract explicitly scoped to the non-Windows compatibility fallback.
- Correct README browser-preview presentation semantics: production presentation remains Registry-only, while only the hostless Vite root preview may use isolated renderer-local representative Commands/status/bindings and can never execute or become production/native authority.
- Keep DESIGN aligned with the same hierarchy: approved task contract and current host code define native behavior; shared geometry/tokens define visual dimensions; browser preview is visual DOM evidence only. Preserve the existing product design and do not redesign the window architecture.
- Keep the detailed Trellis frontend spec contract intact, remove any remaining contradictory wording, and make the spec index identify the populated quality guideline as the active architecture contract rather than an unfinished placeholder.
- Preserve historical task/research records as historical evidence. Do not rewrite archived documents merely because they describe superseded experiments.
- Add no abstraction, compatibility mode, fallback, or implementation proposal.

## Acceptance Criteria

- [x] Live README, DESIGN, and frontend Trellis spec/index agree that Windows standalone and Workflow use D6/D7: opaque fixed `240x320` main plus a detached native `260px` Panel and a real `16px` gap.
- [x] Live documentation says Windows D6/D7 never use `setShape`; shaped attached geometry is named only as the non-Windows compatibility fallback or as historical/non-authoritative evidence.
- [x] Live documentation says the root browser preview uses isolated representative presentation data and shared geometry/content projection, is non-executable, and proves visual DOM parity only.
- [x] No live documentation presents browser preview, browser evidence, or shared CSS staging as proof of HWND separation, DWM, focus, hit testing, z-order, packaged runtime, or Resolve acceptance.
- [x] Searches for `516x320`, `516×320`, and old Windows shape-union wording find no live architecture claim in README, DESIGN, or `.trellis/spec/`.
- [x] The diff contains documentation/task artifacts only and introduces no production-code or architecture change.
- [x] Markdown/reference checks and targeted contradiction searches pass.

## Out of scope

- Production code or test changes.
- New window abstractions or policy layers.
- Reconsidering D6/D7, the non-Windows fallback, browser-preview implementation, Settings, or native lifecycle/focus behavior.
- Re-running Electron, Resolve, Workflow installation, package installation, or manual native-host acceptance for a documentation-only synchronization.
- Editing archived Trellis task artifacts that intentionally record old experiments or superseded contracts.
