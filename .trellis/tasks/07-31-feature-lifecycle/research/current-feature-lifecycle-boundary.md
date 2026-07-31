# Current Feature Lifecycle Boundary

## Existing Owners

- Capability Registry owns registration/executable lookup and Capability Metadata.
- FeatureCatalog owns metadata projection only.
- ConfigManager owns persisted configuration and execution-time completeness checks.
- Each Capability owns provider selection and availability semantics; only `marker.add` currently exposes `selectBackend()`.
- Command Engine remains the final execution gate: configuration is checked before `capability.execute()`.
- Settings renderer consumes plain IPC data and must remain free of Capability/provider logic.

## Missing Contracts

- No generic FeatureStatus service.
- No public non-throwing ConfigManager missing-required projection.
- No generic side-effect-free Capability availability probe.
- No enable/disable source or persistence.
- No last-error lifecycle store or error expiry rule.
- No status IPC/preload APIs or sidebar status UI.

## Key Modeling Risk

`installed` and `enabled` are lifecycle facts, while `ready`, `loading`, `missing-config`, `missing-dependency`, `unavailable`, and `error` are readiness/health outcomes. A single enum loses information and requires precedence rules; a snapshot can represent all three dimensions without inventing transitions. Structured `details` must drive recovery actions so renderer code never parses user-facing messages.
