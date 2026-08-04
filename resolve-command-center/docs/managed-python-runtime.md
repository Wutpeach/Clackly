# Managed Python Runtime

Clackly packages one Windows x64 CPython payload outside the Electron application.
Python Features no longer search `PATH` or use Conda, uv, virtual environments, Store
aliases, or `RESOLVE_COMMAND_CENTER_PYTHON_CMD`.

## Runtime chain

```text
Feature -> Capability -> ScriptCapabilityProvider -> ScriptExecutor
  -> PythonProvider -> RuntimeManager -> RuntimeResolver
  -> RuntimeProbe/cache -> RuntimeLauncher -> Bootstrap script-execute
  -> ScriptContext -> Resolve Script API -> internal JSX launch plan
  -> host AfterEffectsLauncher -> After Effects
```

`RuntimeManager` alone owns resolution, the required Resolve Probe, and one isolated
business-script launch. `PythonProvider` validates the trusted relative entry, adapts
the request/result, replays existing log records, and preserves Runtime error fields.
The six public `ScriptContext` attributes and script success/error envelopes are unchanged.
The isolated Python worker never starts After Effects: `RuntimeManager` consumes its
internal declarative plan, the host validates the configured executable, fixed arguments,
bounded JSX, and temp containment, then launches once with the normal Electron desktop
environment and strips the plan before `PythonProvider` sees the public result.

## Locked current Runtime and build

`resources/runtimes/python-win32-x64.lock.json` pins the official CPython 3.13.14
Windows x64 Embeddable Package, SHA-256, Sigstore metadata, upstream SPDX, and the
tagged CPython license. Binaries and generated output are not committed.

```powershell
npm ci
npm run runtime:stage
npm run package:win
npm run package:verify
npm run workflow:install:package
```

Staging downloads only locked HTTPS URLs (or reuses exact cache filenames), verifies
every SHA-256 before extraction, writes a no-`site` `python313._pth`, copies production
Python sources, and generates `runtime.json` plus an application SPDX SBOM. Packaging
places that tree at `process.resourcesPath/runtimes`; `package:verify` inventories it
and executes the packaged interpreter with hostile Python/Conda environment variables.
The verifier accepts an optional unpacked package root, for example
`npm run package:verify -- build/package-check/win-unpacked`, so a fresh artifact can
be checked without replacing an installed or in-use `release` tree.
The unpacked Workflow Integration files are under `release/win-unpacked/resources/app`
and the external Runtime is their sibling under `resources/runtimes`. A real Resolve
launch installs that app tree beneath `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins`; Resolve's Electron then locates the exact
packaged sibling Runtime (or the installed copy) without consulting `PATH`. A live launch
from that layout remains a mandatory release gate.

## Selection and Override

Normal selection matches Runtime, Node platform/architecture, Capability id, and the
host-owned live Resolve version. It never retries a lower profile or falls back to a
system interpreter. `CLACKLY_PYTHON_EXECUTABLE`, when present, is one authoritative
absolute executable-only Override: malformed or missing values fail closed; a valid
value must pass the same Probe and reports `overridden` plus
`CUSTOM_RUNTIME_UNVERIFIED`.

Only successful Probe results are cached at `%APPDATA%\Clackly\runtime-probe.json`.
Clackly/Runtime/Resolve/bridge/Override fingerprint changes invalidate the record.
Failures and native crashes clear reusable state and are never retried automatically.

## Release status

CPython 3.13.14 is `current` for Windows x64 with Resolve 20.3.2.9. Automated runtime
identity, staging, package layout, isolation, hostile Python-environment verification,
Probe miss/hit, and Workflow Integration loading passed. The host-owned launch boundary
proves AE receives Electron's normal desktop environment, and the user confirmed
post-fix warm and cold exports without the prior Preferences/CEP errors. Per the final
release decision, those independent proofs make another hostile-parent GUI send
redundant.
