# Repair AE export runtime, naming, organization, and activation

## Goal

Make every existing Resolve-to-After-Effects export reliably execute the
installed current Python export core, switch the user to After Effects after a
successful export, and produce predictable project-browser names and placement
without changing the shared `ae.export` architecture or the canonical source
composition.

## Background

- The optional 1080p Preview setting is saved as `true` and appears in the
  installed Capability definition, but a real 3840 x 2160 export created only
  the source composition.
- Repository inspection found that `package:win` builds and packages without
  first running `runtime:stage` (`resolve-command-center/package.json:12-13`).
  Electron Builder then copies the pre-existing staging directory
  (`package.json:34-39`), while package verification compares the packaged
  runtime only with that same staging directory
  (`scripts/verify-package.js:62-75`). A stale staging tree can therefore pass
  verification and be installed.
- All three active Export-to-AE Commands target `ae.export`
  (`command-engine/commands/after-effects.json:1-34`). The shared Python entry
  maps ordinary, video-only, and audio-only policies
  (`scripts/resolve2ae_export.py:6-40`) and the managed persistent runtime is
  their sole Windows execution path (`script-runtime/runtime/manager.js:11-15`).
- The export core currently calls `comp.openInViewer()` but does not explicitly
  activate After Effects (`resolve2ae_core/export.py:617-621`). A warm
  `AfterFX.exe -r` launch can therefore execute JSX without bringing the
  existing AE window to the foreground.
- Current source names are `<prefix>_<timeline>_<scope>_<unix-seconds>`
  (`resolve2ae_core/export.py:588-618`). The user does not use Composition
  Prefix and renames final compositions manually in AE.

## Requirements

### R1. Package the current managed Python source

- Windows packaging must refresh the managed Python staging tree from the
  current repository source before Electron Builder copies it.
- Verification must fail when the current managed Python source, the staging
  copy, and the packaged runtime do not represent the same source revision. It
  must not prove freshness solely by comparing two artifacts derived from one
  stale staging tree.
- The repaired package must contain the 1080p Preview implementation and must
  be installed into the Workflow Integration location before another Resolve
  manual test is requested.
- Do not change the persistent worker protocol, allowlist, bootstrap, or
  request lifecycle.

### R2. Remove Composition Prefix and adopt project-aware names

- Remove `Composition Prefix` from the `ae.export` schema-driven Settings UI.
- A legacy saved `prefix` value must be removed by one silent, capability-owned
  configuration migration before normal schema validation. Preserve `aePath`,
  `create1080pPreviewComp`, and unrelated capability sections. Do not add a
  migration UI or weaken ConfigManager's rejection of unknown keys.
- For each successful export, allocate one positive integer sequence `N` in
  the current AE project for the current Resolve timeline name:
  - Source: `[sourceWidthxsourceHeight]-TimelineName-N`
  - Preview, when enabled: `[1920x1080]-TimelineName-N-Preview`
- Square brackets are literal, `x` is lowercase, and `-Preview` is always
  present on Preview names, including when the source is already 1920 x 1080.
- Sequence groups are independent by exact timeline name. Timeline A and
  Timeline B each begin at `1` in a new AE project.
- Resolution changes do not reset a timeline's sequence. Source and Preview
  from one export share the same `N` and consume only one sequence value.
- Compute `N` as `max(existing matching sequence) + 1` across the entire
  current AE project. Do not fill gaps. User-renamed compositions that no
  longer match the Clackly naming contract do not participate.
- Project state is queried inside the same JSX request; do not persist counters
  in Resolve config, the renderer, or the persistent Python worker.

### R3. Keep optional Preview non-destructive and organize Source comps

- Source remains the canonical composition and retains the Resolve timeline's
  original width, height, timing, frame rate, contents, and layer semantics.
- When Preview is disabled, create only Source and leave it in the AE project
  root, preserving the existing one-composition organization.
- When Preview is enabled:
  - still create and fully populate Source first;
  - locate the first AE `FolderItem` named
    `Clackly Source Comps` anywhere in the current project;
  - create that folder at project root only if no matching folder exists;
  - move Source into that folder;
  - create one 1920 x 1080 Preview at project root, nest Source once, center it,
    and preserve the existing Fit-inside calculation and timing semantics;
  - open Preview in the AE Viewer. Source remains independently usable.
- Moving `Clackly Source Comps` under another user folder must not cause a
  duplicate folder on the next export. Renaming it is treated as absence and
  causes a new root folder to be created.
- Folder lookup and sequence discovery must share one linear pass over the
  flat `app.project.items` collection. Do not traverse disk directories, read
  media contents, create a persistent index, or repeatedly rescan subtrees.

### R4. Reliably activate After Effects for every shared export policy

- After successful construction, select the final Viewer target and explicitly
  activate After Effects from the shared export JSX:
  - Preview disabled: open Source, then activate AE.
  - Preview enabled: open Preview, then activate AE.
- Ordinary, video-only, audio-only, and the existing Blue/range interaction
  mapping must inherit the same behavior through `ae.export`; no
  command-specific activation implementations are allowed.
- Activation occurs only after the requested compositions are constructed. It
  must not introduce a second launch, retry, polling loop, or cross-request
  AE/Resolve state.
- If AE-side activation cannot reliably foreground both warm and cold AE during
  real host validation, stop and report an architecture conflict before adding
  Win32 window manipulation to RuntimeManager, the persistent worker, or the
  host launcher.

### R5. Preserve ownership boundaries

- Composition naming, project-item inspection, organization, Viewer selection,
  and activation remain local JSX policy generated by
  `resolve2ae_core/export.py`.
- Capability schema remains the authority for Settings; removing Prefix must
  not add a Renderer branch or duplicate state.
- Command definitions, Resolve adapters, TimelineRange, RuntimeManager,
  persistent bootstrap/launcher, and `AfterEffectsLauncher` must not acquire
  composition naming, folder, sequence, Preview, or activation policy.
- The current source-composition media, timing, effects, and selection policies
  remain unchanged.

## Acceptance Criteria

- [x] AC1: `package:win` refreshes managed runtime staging before packaging.
- [x] AC2: a regression fails when current managed Python source differs from
  staging or the packaged runtime; the final package contains the current
  Preview markers/behavior.
- [x] AC3: an installed Workflow package with Preview enabled creates both the
  original-resolution Source and a 1920 x 1080 Preview for a 3840 x 2160
  Resolve timeline.
- [x] AC4: Prefix no longer appears in schema-driven Settings. A legacy saved
  Prefix is removed silently before validation while `aePath`, Preview, and
  unrelated settings remain unchanged; no Renderer branch is added.
- [x] AC5: timeline A exports allocate `-1` through `-5`; timeline B's first
  export allocates `-1`; a later resolution change on A allocates `-6`.
- [x] AC6: gaps are not reused, unrelated project items are ignored, and one
  export performs one project-item scan rather than recursive/repeated scans.
- [x] AC7: enabled Source and Preview share `N`, use their true resolution
  tokens, and Preview always ends in `-Preview`; a 1920 x 1080 Source therefore
  cannot have the same name as its Preview.
- [x] AC8: disabled export creates only Source at project root and opens it in
  the Viewer.
- [x] AC9: enabled export preserves Source resolution/content, moves it into a
  project-wide discoverable `Clackly Source Comps`, leaves Preview at root, and
  opens Preview in the Viewer.
- [x] AC10: moving the Source folder under another folder is detected and
  reused; renaming it results in one newly created root folder.
- [x] AC11: 3840 x 2160 still fits at 50%, a non-16:9 source still proves
  `min(1920/sourceWidth, 1080/sourceHeight)`, and no crop/stretch is introduced.
- [x] AC12: generated JSX performs final `openInViewer()` before one AE
  activation for ordinary, video-only, audio-only, and Blue/range paths.
- [x] AC13: real Resolve/AE smoke covers Preview off/on and ordinary,
  audio-only, video-only, and Blue/range exports with AE already running; AE is
  foregrounded and displays the correct comp. A cold-AE case also passes.
- [x] AC14: all existing AE export, runtime, integration, package verification,
  build, and relevant configuration tests pass without changing the shared
  persistent-worker route.
- [x] AC15: the freshly built Workflow package is installed before the user is
  asked to restart Resolve and retest.

## Out of Scope

- Configurable destination folder names, hidden folder identities, or recovery
  after the user renames `Clackly Source Comps`.
- Persisted counters, gap filling, cross-project numbering, or Resolve-side
  timeline IDs.
- Custom Preview dimensions, Fit/Fill/Stretch choices, or a generalized layout
  framework.
- Renaming AE compositions after export, sanitizing every existing JSX string
  in the exporter, or managing the user's broader AE folder hierarchy.
- Command, Settings UI, TimelineRange, export-pipeline, persistent-worker, or
  host-launcher redesign.

## Architecture Conflict Gate

There is no conflict for same-request JSX project inspection, naming,
organization, Viewer selection, and AE activation. Stop implementation and
return the conflict if reliable foreground activation requires Win32 window
ownership outside the existing AE-side JSX contract, or if runtime freshness
cannot be enforced without changing the managed-runtime ownership model.
