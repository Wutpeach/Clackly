# Applicable Runtime Availability Contracts

## Evidence

- `.trellis/spec/backend/quality-guidelines.md:404-418` defines the Runtime Probe contract: the isolated Bootstrap verifies runtime identity, exact Resolve module/library, import, connection, and live version; failures keep stable codes including `RESOLVE_IMPORT_FAILED`, `RESOLVE_NOT_RUNNING`, `RESOLVE_CONNECTION_FAILED`, and `RESOLVE_VERSION_UNVERIFIED`.
- `.trellis/spec/backend/quality-guidelines.md:1107-1125` requires Resolve-dependent scripts to run only after a successful Probe, forbids fallback/retry, retains typed Probe failures, and keeps the packaged Runtime outside asar with verified source identity.
- `.trellis/spec/frontend/quality-guidelines.md:383` forbids renderer Capability-specific branches and message-text parsing.
- `docs/resolve-python-runtime-troubleshooting.md` already documents stable meanings/actions for the controlled Runtime/Probe codes, so implementation should reuse those classifications instead of inventing a diagnostic protocol.

## Current Gap

`PythonProvider.AVAILABILITY_MESSAGES` maps only seven Runtime errors. Controlled bridge/import/connection/version and process/Probe errors rethrow into `FeatureStatusManager`, which intentionally sanitizes unknown errors to `Unable to determine feature status.`. The installed user therefore loses the only safe discriminator needed for remote diagnosis.

## Required Boundary

Keep translation in `PythonProvider`, use static allowlisted messages with stable codes, preserve the existing Feature Status shape and IPC, and leave all unknown errors on the generic fail-closed path.
