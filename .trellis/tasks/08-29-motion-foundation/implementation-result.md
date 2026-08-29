# Motion Foundation implementation result

## Outcome

The first Renderer-only Motion Foundation slice is implemented and passes automated and Resolve-host acceptance. Search is the only Motion consumer. No Host/native lifecycle file changed. The packaged Workflow was installed before handoff, and the user confirmed the restart/manual host validation passed on 2026-08-29.

## Final dependency and boundary

- Exact dependency: `motion@13.1.1`, resolving `framer-motion@13.1.1`, `motion-dom@13.1.1`, and `motion-utils@13.0.0`.
- Raw dependency imports exist only under `resolve-command-center/electron/renderer/motion/`.
- `MotionBoundary` uses synchronous `LazyMotion features={domAnimation}`, `strict`, and `MotionConfig reducedMotion="user"`.
- `softPresence` is the sole preset and sole consumer treatment: 120ms, `cubic-bezier(0.16, 1, 0.3, 1)`, opacity, and at most 3px vertical displacement.
- Settings and `DetachedInteractionPanelApp` remain outside the Motion boundary.
- No `domMax`, spring, stagger, layout projection, shared layout, generic variants factory, wrapper family, or second preset was added.

## Search and reduced motion

- The CSS `mode-enter` keyframe was removed and Launcher-to-Search content now uses local `SoftPresence`.
- State, input, focus, typing, and Escape update immediately and do not wait for animation completion.
- Rapid Launcher/Search interruption settles to exactly one current mode without duplicate or stale content.
- Reduced motion removes spatial displacement before first paint and keeps only a short non-blocking opacity cue.
- The missing CSS reduced-motion coverage for `.launcher-search` and `.footer-control` is fixed.
- The Settings spinner remains CSS-owned; its movement stops under reduced motion while text remains the status authority.

## Size impact

| Artifact | Baseline | Post-change | Delta |
|---|---:|---:|---:|
| Main JS, minified | 504,288 B | 579,611 B | +75,323 B |
| Main JS, gzip level 6 | 210,393 B | 236,231 B | +25,838 B (+12.28%) |
| Windows unpacked files | 4,475 | 5,402 | +927 |
| Windows unpacked bytes | 352,294,880 B | 361,147,552 B | +8,852,672 B (+8.443 MiB, +2.51%) |

The increase is material but matches the pre-reviewed approximately 20 kB renderer feature cost and approximately 9 MB unpacked dependency expectation. It does not trigger rollback, and no second consumer was added to justify or amortize the dependency.

## Validation

- Focused Motion foundation tests: 3/3 passed.
- Full `npm test`: 352 Node subtests plus all Python suites passed.
- Production Vite build: passed, 2,243 modules transformed.
- Headless built-renderer Playwright evidence using native Edge/Playwright media emulation: normal motion, reduced motion, and rapid interruption all passed.
- `npm run package:win`: passed.
- `npm run package:verify`: passed; packaged CPython 3.13.14 x64 verified.
- `git diff --check`: passed, apart from informational line-ending warnings on the shared dirty worktree.
- Boundary audit: no diff under Electron main, preload, Workflow Plugin, Runtime, Resolve, or Command Engine paths; no forbidden Motion feature was found.
- Resolve-host restart/manual acceptance passed on 2026-08-29: D6/D7 native lifecycle, geometry, focus, hit testing, and Settings lifecycle remained stable, so the rollback gate stayed closed.

Evidence is stored under `evidence/playwright/` as three screenshots plus `palette-evidence-report.json`.

## Rollback gate

No automated or manual rollback trigger fired. Future regressions in D6 reveal/conceal, D7 geometry/focus/hit-test, Settings lifecycle, input/focus/Escape, or high-frequency interruption remain reasons to restore the CSS Search keyframe and remove the Motion dependency/foundation.
