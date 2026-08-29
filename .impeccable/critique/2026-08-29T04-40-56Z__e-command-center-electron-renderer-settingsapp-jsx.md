---
target: Settings three-column renderer versus supplied reference
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-08-29T04-40-56Z
slug: e-command-center-electron-renderer-settingsapp-jsx
---
## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Effective status is clear, but lifecycle actions read too weakly. |
| 2 | Match with the real world | 3 | Raw provider identifiers may leak implementation language. |
| 3 | User control and freedom | 3 | Search can hide the selected Feature without resolving the visible context. |
| 4 | Consistency and standards | 4 | Three-column structure and current Palette/Panel language are coherent. |
| 5 | Error prevention | 3 | Async operation tokens protect state; search-context mismatch remains. |
| 6 | Recognition rather than recall | 3 | Inspector exposes bindings, but truncated Feature names need disclosure. |
| 7 | Flexibility and efficiency | 2 | Search exists, but no shortcut hint is shown because no real authority exists yet. |
| 8 | Aesthetic and minimalist design | 4 | Compact neutral surface, restrained separators, no legacy orange-heavy drift. |
| 9 | Error recovery | 2 | Generic failure copy does not identify the failed operation or recovery. |
| 10 | Help and documentation | 3 | Contextual About/Status/Interaction is useful; landmark naming is inaccurate. |
| **Total** | | **30/40** | **Good** |

## Design Specificity Verdict

The result now feels authored for Clackly: it uses the current Palette/Interaction ink surface, compact row rhythm, light-neutral selection and real binding projection rather than a generic SaaS dashboard. The remaining logo is not a CSS accident. The task PRD explicitly allowed a quiet wordmark, the task design said it would remain, `DESIGN.md` recorded it as quiet, and tests protected its selectors. That interpretation conflicts with the user's intended logo-free Settings titlebar and must be corrected across contract, implementation and tests.

The deterministic detector returned `[]` with configured and `--no-config` scans. This means no bundled anti-pattern rule fired; it does not validate native Resolve behavior or the visual/state issues below. Existing headless screenshots and source inspection were used as fallback visual evidence.

## Overall Impression

The three-column architecture, domain separation and new emphasis system are successful. The biggest opportunity is to finish the surface as an operational Settings window: remove the leftover brand header, make selection/search state truthful, and give Inspector actions the same clear control affordance as the rest of the product.

## What's Working

- Navigation / Configuration / Context Inspector is stable and legible at the fixed 760×560 window size.
- Feature configuration stays schema-driven; application settings remain outside FeatureCatalog.
- Ready status is a narrow semantic green dot, while Interaction rows project registered commands and real bindings.
- Light-neutral selection and Save emphasis match the current main interface; legacy orange-heavy cards and controls are gone.

## Priority Issues

### [P1] Remove the Clackly wordmark from the Settings titlebar

**Why it matters:** The current `CLACKLY Settings` header directly contradicts the requested plain Settings titlebar and adds brand weight above an already dense operational surface.

**Fix:** Remove the image and brand wrapper, keep only a compact `Settings` window title, and preserve drag/close/native lifecycle behavior. Update PRD, task design, `DESIGN.md`, sidecar/spec and tests so the wordmark cannot return.

**Suggested command:** `$impeccable distill`

### [P2] Search can hide the active Feature while the other columns keep editing it

**Why it matters:** In `settings-search-match.png`, Navigation shows only Clipboard while Configuration and Inspector still show Export to After Effects. The visible navigation no longer explains the current context.

**Fix:** Keep the active Feature visible in a small `Current` group while it is filtered out, or show an explicit hidden-selection row. Do not silently switch context on every keystroke.

**Suggested command:** `$impeccable harden`

### [P2] Inspector lifecycle actions look disabled

**Why it matters:** `Refresh` and `Disable` are tiny borderless labels, so they read as low-contrast metadata rather than available controls.

**Fix:** Use restrained bordered secondary buttons with monochrome Lucide refresh/power icons and shared control height/radius. Keep them secondary, not light-neutral primary actions.

**Suggested command:** `$impeccable polish`

### [P2] Inspector context and recovery copy are not precise enough

**Why it matters:** The whole `<aside>` is labelled `About` although it contains About, Status and Interaction. Generic failure copy such as “The command could not be completed” does not tell users which operation failed. Browser fixtures also omit real version/provider metadata, so About is not visually verified.

**Fix:** Localize the landmark as `Context Inspector`; project useful abnormal `status.message` only when truthful; use operation-specific recovery copy; add version/provider data to evidence fixtures. Present raw provider IDs only if they are meaningful to users.

**Suggested command:** `$impeccable clarify`

### [P3] Feature names truncate too aggressively

**Why it matters:** All three real Feature labels truncate in the 190px rail, making similarly named commands harder to distinguish.

**Fix:** Preserve one-line rows but provide reliable full-name disclosure. Do not overload the same tooltip with both warning text and the full name.

**Suggested command:** `$impeccable polish`

## Persona Red Flags

- **Alex, power user:** Search produces a navigation/context mismatch, so rapid filtering does not provide a trustworthy fast path.
- **Sam, keyboard/screen-reader user:** The Inspector landmark is announced as About; the 24px lifecycle actions are visually and physically undersized. The Ready dot is correctly paired with text, so status is not color-only.
- **Riley, stress tester:** Generic errors and missing fixture metadata weaken recovery and allow About regressions to escape screenshot coverage.

## Minor Observations and Intentional Differences

- Keep no `Ctrl+K` search hint until a real shortcut authority exists.
- Keep no `M` keyboard binding until the interaction authority can truthfully project it.
- Keep the flat category list: no Show More tree is required.
- Keep the schema checkbox rather than inventing a switch control type.
- Keep fixed-window close-only native controls; minimize/maximize are outside the current window contract.
- Keep Ready without explanatory prose; only abnormal states need a brief reason.
- The narrower 760×560 density and stacked keycaps are intentional product adaptations, not failures to copy the much wider reference.

## Questions to Consider

- Should the corrective pass stop at the explicit Logo/titlebar correction, or also fix every confirmed P2 state and Inspector issue?
- For a filtered-out active Feature, is a compact `Current` group preferable to automatically changing selection?
