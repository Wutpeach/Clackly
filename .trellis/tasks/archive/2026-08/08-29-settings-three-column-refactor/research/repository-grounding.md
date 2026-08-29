# Repository grounding

## Current Settings topology

- `resolve-command-center/electron/renderer/SettingsApp.jsx` currently owns one `selectedId` that mixes the synthetic `general` destination with Feature ids. It loads Features, Commands, interaction bindings, and Feature statuses together, then renders a left sidebar plus one right detail column.
- The feature detail currently repeats description, a lifecycle summary (`Installed`, `Enabled`, `Readiness`), configuration, and Interaction Help in one scroll area. The fixed action footer owns feedback, Reset, and Save.
- `SettingsRenderer.jsx` is already a generic schema projection for string, number, boolean, color, path/folder, and select fields. It should remain unchanged unless the new layout exposes a verified presentation defect.
- `styles.css` owns Settings paint. Current Settings values already project the accepted Palette selection and control language, but `.settings-workspace` still declares two columns and the detail/lifecycle/help selectors encode the old topology.

## Authorities and data flow

- Feature metadata and config schema: CapabilityRegistry -> `FeatureCatalog.getAllFeatures()` -> `features:list` -> preload `listFeatures()` -> localized renderer projection. Metadata already contains `description`, `version`, and `providers`.
- Feature configuration: ConfigManager -> `config:get/save/reset` -> preload -> `SettingsRenderer`; save/reset refresh the same FeatureStatusManager record afterward.
- Runtime lifecycle: FeatureStatusManager -> `feature-status:list/refresh/set-enabled` -> preload. Records contain installed/enabled/status/message/details; renderer code already joins them by capability id.
- Interaction bindings: InteractionManager/BindingStorage -> `interactions:list` -> preload. `model.mjs#getInteractionHelp()` resolves each binding target and action command against the registered Command catalog, localizes modifier/button labels, and produces keycap/action rows. `getInteractionHelpCommands()` groups those truthful rows by Command for one Feature.
- Application settings: Preferences owns `preferences.json`; LocalizationService and LocalizationContext expose the current locale preference and effective locale. This is deliberately separate from ConfigManager/capability configuration.
- Application version: `resolve-command-center/package.json` is already the Clackly version authority used by the composition root. A bundled read-only import is sufficient for the application inspector; no registry/provider is warranted.

## Current visual authority

- Root `DESIGN.md`, its generated `.impeccable/design.json` sidecar, `electron/shared/palette-geometry.json`, `paletteVisualStyle.mjs`, `InteractionPanelContent.jsx`, and Palette/Interaction rules in `styles.css` agree on the current neutral instrument language.
- Shared facts to preserve: `#151619` surface, weak separators, `30px` rows, `#E7E8EA` light emphasis, `#17191D` emphasis foreground, `3–4px` operational radii, monochrome Lucide icons, inset controls/keycaps, and compact typography.
- Verified drift: `DESIGN.md` and `.impeccable/design.json` still define orange as primary accent, while `styles.css` uses it for focus rings, the Palette pin dot, checkbox accent, and Settings Save. The main selection hierarchy and the supplied Settings direction have already moved to light-neutral emphasis, so these remaining orange interaction roles are stale rather than protected authority.
- Current Settings screenshot evidence confirms that the latest two-pane paint already removed legacy orange selection, large icon tiles, framed cards, and tall footer. The three-column work should reuse this paint rather than restart from the older visual world.

## Reference-image conflicts and selected resolution

1. The reference is much wider and includes Feature search, `Show More`, Windows minimize/maximize controls, green status color, large spacing, and light Save. The user subsequently selected two narrow additions: a real renderer-local Feature filter and a real Ready-backed green status dot. `Show More`, Windows controls, broad green coloration, large spacing, and light Save remain intentionally excluded.
2. Root `DESIGN.md` still says Settings retains two-pane geometry. The user's new explicit three-column confirmation supersedes only that topology clause. The same file remains visual/native-window authority everywhere else.
3. The reference titlebar says only `Settings`. The approved Settings contract now keeps the compact custom drag/close bar but removes the former quiet path-based wordmark entirely; Settings renders only the localized title so the dense operational surface has no competing brand header.
4. The reference status uses a green dot and lays out larger bordered buttons. Clackly currently has no green status token; this task adds one narrowly scoped Ready-dot semantic backed by the real status record. Buttons use the new light-neutral primary emphasis or existing neutral secondary grammar; all non-Ready states remain restrained.

## Minimum responsibility change

- Reshape `SettingsApp.jsx` into explicit navigation, configuration, and inspector regions while keeping its existing API calls and operation handlers; add only local search state derived from the already loaded localized Feature projection.
- Use `null` application selection versus string Feature id so the application destination cannot collide with FeatureCatalog and does not need a sentinel registry record.
- Add one pure effective-status presenter in `model.mjs`; keep FeatureStatusManager unchanged.
- Move the existing real interaction-help projection into the inspector; do not create new binding state.
- Update shared renderer emphasis tokens plus Settings-owned CSS, localization copy, browser fixtures/evidence selectors, focused renderer tests, `DESIGN.md` plus its design sidecar, and frontend quality guidance. Preserve Palette behavior and verify its paint in a bounded evidence pass.
- Preserve `window.js`, preload, feature UI IPC, ConfigManager, Preferences, FeatureStatusManager, InteractionManager, BindingStorage, and FeatureCatalog unless verification reveals an actual regression requiring a narrow test-only adjustment.
