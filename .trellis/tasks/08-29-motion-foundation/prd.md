# Motion Foundation research

## Goal

Define a lightweight, unified, controlled, and reusable motion foundation for Clackly's Electron renderer, grounded in the current repository. The foundation should prevent components from independently accumulating arbitrary transitions, keyframes, timeouts, and spring settings while preserving the stable Host/native window architecture.

This task is planning-only. It must determine whether Motion for React (`motion` / `motion/react`) is a good fit before any dependency or product-code change is proposed.

## Confirmed Facts

- The current renderer uses React 18.3.1, Vite 8.1.5, and Electron 36.3.2, and has no animation-library dependency.
- Product presentation motion is centralized in one Renderer stylesheet with two duration tokens, six transition declarations, one content-mode entrance, one loading spinner, and one reduced-motion media query.
- Renderer timers and animation-frame calls currently own tooltip disclosure, focus/measurement scheduling, preview fixtures, and runtime deadlines; they are not presentation interpolation.
- D6/D7 native lifecycle is immediate and untimed. Repository specs, design docs, and tests explicitly forbid authored native reveal/conceal motion.
- Motion for React 13.1.1 is technically compatible with the current React/Vite/Electron renderer. Its dependency and bundle cost is material enough to require a measured, reversible first slice.

## Requirements

### Repository audit

- Confirm the actual React, Vite, Electron, build, test, and styling versions and conventions from repository evidence.
- Inventory motion-related code, including CSS transitions, animations, keyframes, JavaScript timers, `requestAnimationFrame`, Web Animations, and existing animation dependencies.
- Classify each relevant implementation as one of:
  - Renderer DOM/SVG presentation animation.
  - UI/state/async timing that is not presentation animation.
  - Host/native window lifecycle, geometry, reveal/conceal, focus, opacity, hit-test, or positioning behavior.
- Identify existing accessibility and `prefers-reduced-motion` handling, tests, and gaps.

### Compatibility and dependency decision

- Assess Motion for React compatibility with the repository's actual React/Vite/Electron stack, package manager, bundle architecture, and test setup.
- Evaluate dependency cost, tree-shaking/import shape, runtime ownership, SSR relevance, and any Electron/CSP or packaging concern that materially affects Clackly.
- Stop and recommend against Motion if repository evidence shows it is unsuitable; do not force adoption.
- Do not introduce Tailwind, a new UI design system, Motion Primitives, React Bits, or another component system.

### Architecture boundary

- Preserve the authority chain: Host owns native windows, geometry, lifecycle, focus, hit-test, and native opacity; Renderer owns UI state and presentation; the Motion Foundation may own Renderer presentation animation only.
- Motion may cover Renderer DOM/SVG presence, layout continuity, hover/press feedback, and lightweight information-state transitions.
- Motion must never own or influence Electron `BrowserWindow` lifecycle, D6 Palette reveal/conceal, D7 detached Interaction Panel lifecycle/positioning/focus, Host geometry authority, native opacity/hit-test/focus, or Settings window lifecycle.
- Do not redesign or refactor the stable D6/D7 native dual-window architecture or `window.js` for this foundation.

### Minimal foundation proposal

- Decide whether Clackly needs a small preset/token layer between components and Motion for React.
- If justified, derive the minimum vocabulary from real repository patterns only; do not design a comprehensive animation system or general-purpose DSL.
- Define reduced-motion behavior as part of the foundation contract.
- Select one or two low-risk, existing Renderer UI scenarios as validation candidates without proposing a broad UI animation pass.
- Do not require replacement of all existing CSS transitions; retain CSS where it is the simpler and more appropriate owner.

## Key Decisions

- Recommend one bounded Motion adoption slice rather than a broad animation rollout or a dependency-free rejection.
- Keep simple hover, focus, press, selection, and loading animation in CSS.
- If implementation is later approved, use a Renderer-local strict `LazyMotion`/`domAnimation` boundary and one repository-derived `softPresence` preset; defer layout/`domMax` until a real separate need exists.
- Validate first against the existing Launcher/Search content-mode transition. Settings feedback presence is optional and must be omitted if the first candidate already proves the contract.
- Keep the detached D7 Interaction Panel outside the first Motion boundary, and never change Host/native files to support Renderer motion.

## Acceptance Criteria

- [ ] The audit lists relevant implementations with file and line anchors and clearly separates presentation motion from state/async timing and Host/native lifecycle.
- [ ] The compatibility assessment reaches an evidence-backed adopt / do-not-adopt recommendation for Motion for React.
- [ ] The proposed dependency and ownership boundary prevents Motion from crossing into D6/D7 or any native window authority.
- [ ] The preset-layer recommendation is explicitly justified and, if recommended, contains only repository-evidenced primitives plus a reduced-motion contract.
- [ ] One or two real, low-risk validation candidates are named with rationale, acceptance behavior, and explicit exclusions.
- [ ] The plan includes a bounded implementation scope, validation strategy, rollback points, and architecture/scope-creep risks.
- [ ] `prd.md`, `design.md`, and `implement.md` record the converged repository-grounded plan; no product code or dependency is changed in this planning task.

## Out of Scope

- Broad animation of existing Clackly UI.
- Palette visual redesign.
- Any D6/D7 native behavior change.
- Refactoring `window.js`.
- A large design-token system, universal animation DSL, or speculative API.
- Replacing every existing CSS transition.
- Implementation, dependency installation, or package-lock changes during this phase.
