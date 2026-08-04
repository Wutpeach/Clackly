# Phase 6.5D Current-State Research

## Existing execution boundary

- `PythonProvider.js` defaults to `python`, imports `node:child_process`, owns spawn/stdin/stdout/stderr, validates the script envelope, replays logs, and returns results.
- `registerScripts.js` constructs that provider; both `electron/main/main.js` and `workflow-plugin/main.js` call it without an executable override.
- `python_runner.py` owns the six-attribute ScriptContext, lazy Resolve adapter access, sync/async Feature execution, captured log records, and the existing script result/error envelope.
- `resolve2ae_export.py` is already business-only except that its Context reaches Resolve through the current runner.

## Existing Managed Runtime building blocks

- 6.5A: `runtime/{loader,registry,resolver,errors}.js` plus `resources/runtimes/manifest.json`.
- 6.5B: `runtime/{environment,launcher,bootstrap}.js/.py`; fixed `-I -u -X faulthandler`, no PATH, bounded process diagnostics, timeout, cleanup, and native crash containment.
- 6.5C: `runtime/probe.js`; Resolve Probe, success-only atomic cache, full material fingerprint, three-axis status, and `RUNTIME_NATIVE_BRIDGE_CRASH` mapping.
- Current verified live tuple: Clackly 0.1.0, Resolve 20.3.2.9, bridge 20.3.2, CPython 3.13.1 x64. The shell-default Python 3.11 was not used for that Probe.

## Packaging gap

- `package.json` has Vite `build` but no electron-builder/Forge/Packager dependency or configuration.
- `scripts/install-workflow-plugin.ps1` currently copies or junctions the source tree into Resolve's Workflow Integration Plugins directory.
- The vendor example plugins are real directories with `manifest.xml`, `package.json`, `main.js`, and `WorkflowIntegration.node`; there is no existing asar contract to reuse.
- The first package should therefore keep the Electron app directory unpacked and place the Runtime separately at `resources/runtimes`. Artifact inspection must prove `python.exe` is outside asar and source paths.
- Python cannot import Clackly Python files from Electron asar. Staging must include Bootstrap, runner, `resolve/`, `scripts/`, and `resolve2ae_core/` beside the embedded interpreter. These modules currently use only the standard library and Resolve's supplied bridge.

## Official candidate evidence

- Release page: `https://www.python.org/downloads/release/python-31314/`
- Asset: `https://www.python.org/ftp/python/3.13.14/python-3.13.14-embed-amd64.zip`
- Asset response: HTTP 200, 10,964,839 bytes, last modified 2026-06-10.
- Official SHA-256: `90b4e5b9898b72d744650524bff92377c367f44bd5fbd09e3148656c080ad907`.
- Official sidecars: `.sigstore`, `.asc`, and `.spdx.json` are published next to the ZIP.
- CPython LICENSE is available from the official CPython `v3.13.14` source tag. The lock/staging implementation must pin and retain its exact bytes/hash rather than fetching an unversioned branch.
- Installed npm 11.13.0 provides `npm sbom --sbom-format <cyclonedx|spdx>`; no new SBOM generator is needed.

## Planning implications

- Runtime payload staging, application integration, and packaged live acceptance are one release chain; splitting them would leave child tasks unable to verify independently.
- A package tool must be added because the repository has none. The minimal planned choice is electron-builder directory output with `asar: false` and Runtime `extraResources`; live Resolve acceptance remains the authority if the vendor host rejects that layout.
- The live Resolve version must be supplied through a host-owned adapter. PythonProvider and Feature code must not select a Manifest profile or version.
- If 3.13.14 fails, the fallback decision is mechanical: repeat all packaged checks with 3.13.1, mark `legacy-pinned` only after success, persist failure evidence, and create the mandated upgrade blocker.

