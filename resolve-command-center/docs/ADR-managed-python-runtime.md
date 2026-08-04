# ADR: package and isolate Python

## Decision

Clackly builds one hash-locked official CPython Windows x64 Embeddable Package and
ships it as an Electron external resource. One `RuntimeManager` composes the existing
Registry/Resolver, success-only Probe Cache, isolated Launcher, and Bootstrap. The
product performs no Runtime download or update.

The first Workflow Integration package uses `asar: false`; Python and staged Clackly
sources still live separately at `resources/runtimes`. Native PowerShell ZIP/hash
operations and `npm sbom` avoid another build dependency. `electron-builder` is the
only new packaging dependency.

## Consequences

- End users do not need system Python, and ambient Python state cannot select execution.
- Override is explicit, executable-only, authoritative, Probe-gated, and visibly unverified.
- Resolve native crashes are contained in short-lived workers; no script or backend retry
  can duplicate an export.
- The Runtime worker keeps its four-variable isolation allowlist and cannot launch desktop
  applications. A host-owned launcher validates the internal JSX plan and starts After
  Effects once with Electron's normal desktop environment.
- Artifact size, CPython security maintenance, license/SBOM inventory, and live
  Resolve/After Effects release qualification become product responsibilities.

## Rejected/deferred

PATH fallback, version guessing, long-lived workers, pools, retries, runtime downloaders,
online catalogs, settings UI, multiple installed Runtime lifecycles, macOS qualification,
and installer signing are deferred. Add them only with a separate measured requirement.

## Current risk and rollback

The packaged Workflow Integration, CPython 3.13.14 Probe, and post-fix warm/cold After
Effects exports have live evidence without recurrence of the Preferences/CEP errors.
Hostile Python-parent package verification proves Runtime selection/isolation, while the
host-owned launch contract and real warm/cold sends independently prove desktop behavior.
The user approved this composed evidence as the final release gate, so CPython 3.13.14 is
current. Roll back the complete application build; never mix a prior application with a
different unpacked Runtime or re-enable system-Python fallback.
