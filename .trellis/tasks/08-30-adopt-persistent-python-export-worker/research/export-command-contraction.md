# Export-to-AE command contraction

## Current product contract

Export-to-AE has one visible card and three executable media actions: mixed, audio-only, and video-only. Each action uses the same target policy: select the earliest eligible Blue duration-marker range when one exists, otherwise fall back to the current automatic playhead selection. Cyan markers are ignored.

The current Command registry and Python wrapper still retain three pre-Clackly internal ids: current/playhead-only, explicit Blue-range video, and `CyanRange`. The last id is especially misleading: Cyan was the legacy audio-range interaction, while the current wrapper repurposes the name as Blue-range mixed export. None of these are current product actions.

## Required contraction

- Keep `timeline.exportToAfterEffects`, `timeline.exportAudioToAfterEffects`, and `timeline.exportVideoToAfterEffects`.
- Remove `timeline.exportCurrentToAfterEffects`, `timeline.exportBlueRangeToAfterEffects`, and `timeline.exportCyanRangeToAfterEffects` from Command metadata, executable-policy routing, and permanent-worker routing.
- Do not add separate range commands. Blue range is a target-selection condition shared by all three media actions.
- Do not restore Cyan marker matching or reinterpret Cyan as Blue.

## Persisted binding migration

The compatibility boundary is persisted interaction data, not permanent executable legacy commands. On load, exact historical shipped-default shapes rewrite directly to `DEFAULT_BINDINGS`. Customized legacy roots are backed up, then migrated with the existing collision/warning behavior to the single visible card and nearest current media action:

| Legacy action | Current action |
| --- | --- |
| current/playhead-only mixed | mixed |
| explicit Blue-range video | video-only |
| legacy Cyan-range audio | audio-only |

After load, no persisted target or action retains a retired id. The migrated action follows the current automatic Blue-range/playhead rule; exact removed current-only or explicit-range semantics are intentionally not preserved.

## Qualification boundary

Automated parity covers the three media policies with both playhead and Blue-range fixtures. Migration tests cover shipped defaults, customized bindings, backups, collisions, and absence of retired ids. Direct execution of a retired id must fail at the Command boundary rather than reach Python.
