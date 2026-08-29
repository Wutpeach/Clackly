# Research: Applicable Trellis Contracts

This is a routing summary, not a replacement for the source specs. Implementation and checking must still open the cited sections.

## Backend quality contracts

- `backend/quality-guidelines.md:20-40` — Command manifests remain fixed presentation/intent metadata; Command execution remains generic; the shared Composition Root owns shared application services for both hosts.
- `backend/quality-guidelines.md:48-61` — unknown Commands, missing Capabilities, disabled Features, and configuration errors reject before execution. Usage recording must sit after these gates.
- `backend/quality-guidelines.md:75-89` — Registry/executor behavior requires defensive and execution-boundary tests.
- `backend/quality-guidelines.md:901-928` — InteractionManager owns exact binding matching only and delegates the matched Command ID; Registry remains Command ID -> Capability mapping authority.
- `backend/quality-guidelines.md:930-954` — unmatched/invalid interactions execute nothing; matched executor errors propagate unchanged; host/renderer changes require full Node/build checks.
- `backend/quality-guidelines.md:1169-1188` — no execution backend in manifests, no executable code over transport, and generic Command/Capability routing must remain intact.

## Frontend quality contracts

- `frontend/quality-guidelines.md:17-45` — the current Palette boundary names Search/preload/Command shapes; the old renderer id/name/keywords contract is intentionally replaced by this task, while Registry-only production presentation, generic presentability, metadata-driven UI, and command-ID-only execution remain mandatory.
- `frontend/quality-guidelines.md:47-68` — this task must not change D6/D7 geometry, window policy, motion, browser-preview authority, or Settings separation.
- `frontend/quality-guidelines.md:70-108` — preserve error/focus/empty-state/host behavior and validate Search, internal filtering, preview isolation, build, and packaging.
- `frontend/quality-guidelines.md:388-414` — Preferences is the only locale authority; English base fields are per-field fallback; stable IDs/execution never carry locale; locale persistence precedes broadcast.
- `frontend/quality-guidelines.md:416-443` — locale/metadata validation and `en -> zh-CN -> en` presentation changes require tests and Workflow install before Resolve acceptance.
- `frontend/quality-guidelines.md:479-518` — direct keyboard activation and matched mouse interactions use different UI routes but converge on Command IDs; actual mapped action ID matters.
- `frontend/quality-guidelines.md:547-582` — renderer cannot import storage/Resolve execution, production data stays Registry-only, preload remains the renderer boundary, and full build/package/search/model checks apply.

## Shared thinking guides

- `guides/cross-layer-thinking-guide.md:19-50` — map source -> projection -> storage/retrieval -> IPC -> display contracts explicitly.
- `guides/cross-layer-thinking-guide.md:62-101` — one owner validates and projects each untyped persisted/IPC payload; consumers do not redefine it.
- `guides/code-reuse-thinking-guide.md:15-49` — search first and remove duplicate Search/localization functions rather than extending both.

