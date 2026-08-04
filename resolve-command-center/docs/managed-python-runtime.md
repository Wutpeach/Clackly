# Managed Python Runtime

Clackly packages one Windows x64 CPython payload outside the Electron application.
Python Features no longer search `PATH` or use Conda, uv, virtual environments, Store
aliases, or `RESOLVE_COMMAND_CENTER_PYTHON_CMD`.

## Runtime chain

```text
Feature -> Capability -> ScriptCapabilityProvider -> ScriptExecutor
  -> PythonProvider -> RuntimeManager -> RuntimeResolver
  -> RuntimeProbe/cache -> RuntimeLauncher -> Bootstrap script-execute
  -> ScriptContext -> Resolve Script API -> After Effects
```

`RuntimeManager` alone owns resolution, the required Resolve Probe, and one isolated
business-script launch. `PythonProvider` validates the trusted relative entry, adapts
the request/result, replays existing log records, and preserves Runtime error fields.
The six public `ScriptContext` attributes and script success/error envelopes are unchanged.

## Locked candidate and build

`resources/runtimes/python-win32-x64.lock.json` pins the official CPython 3.13.14
Windows x64 Embeddable Package, SHA-256, Sigstore metadata, upstream SPDX, and the
tagged CPython license. Binaries and generated output are not committed.

```powershell
npm ci
npm run runtime:stage
npm run package:win
npm run package:verify
```

Staging downloads only locked HTTPS URLs (or reuses exact cache filenames), verifies
every SHA-256 before extraction, writes a no-`site` `python313._pth`, copies production
Python sources, and generates `runtime.json` plus an application SPDX SBOM. Packaging
places that tree at `process.resourcesPath/runtimes`; `package:verify` inventories it
and executes the packaged interpreter with hostile Python/Conda environment variables.
The unpacked Workflow Integration files are under `release/win-unpacked/resources/app`
and the external Runtime is their sibling under `resources/runtimes`. A real Resolve
launch from that layout remains a mandatory release gate.

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

CPython 3.13.14 remains `candidate`. Automated runtime identity, staging, package
layout, isolation, and packaged execution pass, but the required live Resolve Probe,
cache hit, Workflow Integration launch, and real Export-to-AE send have not all passed.
Do not change the lock/Manifest to `current` until the complete matrix passes.
