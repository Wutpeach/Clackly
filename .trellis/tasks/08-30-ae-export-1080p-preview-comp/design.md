# Optional 1080p AE preview composition design

## Boundary and ownership

The current execution chain remains authoritative:

```text
three Export-to-AE Commands
  -> ae.export Capability + scoped config
  -> ScriptCapabilityProvider / RuntimeManager
  -> dedicated persistent Python worker
  -> scripts/resolve2ae_export.execute
  -> resolve2ae_core.export.process_and_send
  -> bounded After Effects JSX launch plan
  -> host-owned After Effects launcher
```

Only three existing ownership points need product changes:

1. `capability/definitions/ae-export.json` declares the optional localized
   boolean.
2. `scripts/resolve2ae_export.py` maps the scoped Capability value into the
   existing export-core config object shared by all three Commands.
3. `resolve2ae_core/export.py` conditionally appends wrapper construction after
   every source layer has been generated.

Command manifests, renderer code, Resolve adapters, TimelineRange, runtime
manager, persistent bootstrap/launcher, and desktop launcher remain unchanged.

## Configuration contract

The key is `create1080pPreviewComp`, matching the repository's camelCase schema
keys (`aePath`) and boolean action naming (`organizeByProject`). It is optional.
The effective value is true only for the boolean `true`; missing, null-like
test fixtures, and false remain off.

No schema-default facility or config migration is added. This preserves old
saved documents and lets the existing checkbox's `Boolean(undefined)` behavior
present the default-off state. Existing registry localization overlays provide
English/base and `zh-CN` labels.

## Composition construction

`process_and_send()` retains its existing source-comp construction exactly.
When the effective setting is true, it appends a small local JSX block near the
end of the source construction, immediately before `app.endUndoGroup()`:

```text
previewComp = addComp(sourceName + "_Preview_1080p",
                      1920, 1080, 1,
                      sourceComp.duration,
                      sourceComp.frameRate)
previewLayer = previewComp.layers.add(sourceComp)
previewLayer.Position = [previewComp.width / 2, previewComp.height / 2]
fitPercent = min(previewComp.width / sourceComp.width,
                 previewComp.height / sourceComp.height) * 100
previewLayer.Scale = [fitPercent, fitPercent]
```

Using composition properties inside JSX keeps timing and dimensions tied to the
objects After Effects actually created. Uniform scale preserves aspect ratio;
the minimum ratio guarantees both scaled axes are no larger than the target,
so the entire source remains visible. No layer crop, mask, stretch, or source
mutation is introduced.

The source composition remains the variable `comp`, remains named and opened as
today, and is independently accessible in the AE project. The wrapper is a new
composition referencing `comp`; it is not a replacement result.

## Compatibility

- Disabled/absent: the conditional appends no JSX, so existing snapshots and
  host launch payload remain byte-for-byte compatible.
- Enabled: the public terminal result and internal launch-plan envelope keep the
  same shape; only the contained JSX has the extra wrapper block.
- All three Commands inherit the behavior because `COMMAND_POLICIES` changes no
  execution ownership and the shared entry reads one Capability config value.
- The persistent worker request already transports arbitrary validated JSON
  config values; no protocol, lifecycle, prewarm, or recovery change is needed.

## Naming and collisions

The current source name includes the configured prefix, timeline name, scope,
and current timestamp. The wrapper derives its name from that source name plus
the fixed suffix `_Preview_1080p`. This makes the relationship deterministic
and retains the existing timestamp-based collision behavior.

## Testing strategy

- Characterize schema metadata, localization, and generic boolean projection.
- Extend script-entry tests to prove all three Command policies forward the
  same effective boolean, including missing/false default-off behavior.
- Keep all existing disabled snapshots unchanged.
- Add focused core assertions for enabled 3840 x 2160 and non-16:9 2048 x 1536
  timelines. Assert source addComp is unchanged, wrapper order/dimensions/name,
  nested source reference, source-derived timing, explicit centering, runtime
  minimum-ratio calculation, and equal scale axes.
- Run the full relevant Python/Node regression set and build.

## Rollback

The change is isolated and default-off. Rollback removes the schema field,
entry mapping, guarded JSX block, and their focused tests. No stored-data
migration or runtime protocol rollback is required; an already persisted
optional field becomes unknown to an older build and must therefore be removed
from config before downgrading, or the pre-change config document restored.

## New abstractions and dependencies

None. The fit operation stays a local guarded JSX block. No cross-boundary
dependency, generalized layout helper, Renderer branch, or worker protocol is
introduced.
