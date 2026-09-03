# Packaged AE Export Status Repair Design

## Problem Boundary

The installed package, saved `aePath`, Resolve version/edition, and `External scripting: Local` prerequisite have been checked. The remaining failure is inside the existing managed-Runtime availability path, where controlled Probe errors are rethrown by `PythonProvider` and collapsed by `FeatureStatusManager` into `Unable to determine feature status.`.

## Data Flow

```text
Bootstrap/Runtime failure code
  -> RuntimeProbe result
  -> RuntimeManager typed error
  -> PythonProvider availability allowlist
  -> existing FeatureStatus record/message
  -> existing IPC
  -> Settings/Palette
```

No renderer, IPC, or Feature Status payload change is needed. `PythonProvider` remains the single translation boundary because it already owns the Runtime-error-to-Feature-availability table.

## Contracts

- Extend the existing static allowlist only for controlled errors already emitted by the Runtime/Probe boundary and documented in `docs/resolve-python-runtime-troubleshooting.md`.
- Each added entry returns a static, actionable message containing its stable error code. It never forwards `error.message`, filesystem paths, subprocess output, or nested diagnostics.
- Cover at least the unresolved user-machine branches: `RESOLVE_IMPORT_FAILED`, `RESOLVE_CONNECTION_FAILED`, `RESOLVE_VERSION_UNVERIFIED`, managed-Python launch/process failure, and native/Protocol Probe failure.
- Preserve current statuses for missing configuration, missing dependencies, unsupported Resolve profiles, and a healthy Runtime.
- Unknown errors continue to rethrow and receive the generic Feature Status message. The generic catch remains the trust boundary for unexpected failures.
- The first rebuilt Beta is a diagnostic repair candidate. It is not accepted as restoring export until the user-machine status becomes Ready and a real Export to AE succeeds, or its stable code identifies and the task fixes a further code defect.

## Compatibility And Rollback

- No stored data, schema, config, IPC, renderer, Command, Runtime Manifest, or export behavior changes.
- Rollback is limited to the added availability-table entries and their focused test rows.
- Existing installation/package layout stays unchanged.

## Validation

- Table-driven provider tests prove each controlled code maps to the intended status, static message, and missing-dependency list.
- An unknown error still rejects so `FeatureStatusManager` keeps the generic fallback.
- Run focused Runtime/Feature Status tests, the full test suite, renderer build, package verification, internal Beta package tests, and an installed-package candidate check.
- Final acceptance requires the affected user machine to report the stable outcome and execute a real Export to AE after any indicated root fix.
