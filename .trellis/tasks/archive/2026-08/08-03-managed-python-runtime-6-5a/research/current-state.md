# Research: Phase 6.5A managed Python runtime registry and resolver

- Query: Determine the smallest repository-native module layout and contracts for a versioned Runtime Manifest, Runtime Registry, deterministic Resolver, executable-only override, typed errors, support-status classification, and one Windows x64 Resolve 20.3.2 / CPython 3.13.x profile without changing production Python execution.
- Scope: mixed (repository, installed Resolve/Python runtime, bundled vendor documentation)
- Date: 2026-08-03

## Findings

### Executive recommendation

Phase 6.5A should add a metadata-only selection boundary under `script-runtime/runtime/` and one repository resource manifest. It should not edit `PythonProvider`, `registerScriptCapabilities`, either Electron host, any Feature, or any Python code. The smallest boundary consistent with current repository patterns is:

```text
resolve-command-center/
├── resources/runtimes/manifest.json
└── script-runtime/
    ├── runtime/
    │   ├── errors.js
    │   ├── loader.js
    │   ├── registry.js
    │   └── resolver.js
    └── runtime.test.js
```

The single top-level `script-runtime/runtime.test.js` is deliberate: the current `npm test` glob includes `script-runtime/*.test.js` but not nested `script-runtime/runtime/*.test.js` (`resolve-command-center/package.json:12`). Co-locating separate nested tests is also valid, but then `package.json` must add that glob.

This split is not speculative layering. The repository already separates manifest loading from defensive registry ownership in `capability/loader.js` and `capability/registry.js`; the resolver is the new selection policy, while `errors.js` is shared by loading and resolution. No extra schema library, semver dependency, platform adapter, discovery service, probe process, launcher, or provider abstraction is needed.

### Confirmed current execution boundary

- The current runtime chain is `Capability -> ScriptCapabilityProvider -> ScriptExecutor -> PythonProvider`: `ScriptCapabilityProvider` forwards a defensive config snapshot at `resolve-command-center/script-runtime/ScriptCapabilityProvider.js:18-35`, and `ScriptExecutor` performs runtime-name lookup at `resolve-command-center/script-runtime/ScriptExecutor.js:6-18`.
- `registerScriptCapabilities()` already owns the shared construction seam and accepts `pythonExecutable` (`resolve-command-center/capability/registerScripts.js:10-27`). Both hosts call it without that option (`resolve-command-center/electron/main/main.js:39-42`; `resolve-command-center/workflow-plugin/main.js:120-123`).
- `PythonProvider` defaults to literal `"python"` and stores it without validation (`resolve-command-center/script-runtime/providers/PythonProvider.js:13-25`). It later passes that value directly to `spawn()` with `shell: false` (`:65-71`).
- Existing provider tests prove constructor injection but intentionally use a bare fake name, and explicitly preserve the PATH default (`resolve-command-center/script-runtime/providers/PythonProvider.test.js:42-70,73-84`). That behavior must remain unchanged in Phase 6.5A per the PRD.
- The backend spec already says Python process ownership stays in `PythonProvider`, the bridge command environment variable may contain arguments and must not be reused, executable-only constructor injection is the customization seam, and no retry occurs after execution begins (`.trellis/spec/backend/quality-guidelines.md:121,137,144,156`).
- The prior crash localized the native failure before Resolve2AE core execution: PATH CPython 3.11/3.12 crashes while loading Resolve 20.3.2's binding, while CPython 3.13.1 succeeds (`.trellis/tasks/08-03-fix-resolve2ae-export-crash/research/crash-boundary.md:9-32,122-150`). Therefore selection belongs before `PythonProvider` construction in a later integration phase, not in Feature or Python code.

### Repository patterns to reuse

- JSON resource loading uses Node built-ins, fixed directories, sorted input, duplicate-id detection, and `structuredClone` (`resolve-command-center/capability/loader.js:1-4,22-56`).
- Registries own a private `Map` and expose narrow getters (`resolve-command-center/capability/registry.js:12-13,82-99`). Runtime Registry should improve on the current metadata getter by returning fresh clones, because the Phase 6.5A PRD explicitly requires defensive records.
- Entry containment already uses `path.resolve`, `path.relative`, `fs.realpathSync`, and `statSync().isFile()` (`resolve-command-center/script-runtime/providers/PythonProvider.js:5-9,28-42`). Reuse the same containment rule for manifest-relative managed executables; do not invent a second path-security policy.
- Numeric dotted sorting already exists without a semver dependency for After Effects discovery (`resolve-command-center/capability/afterEffectsPath.js:73-82`). Runtime version sorting can use the same numeric-component approach.
- Typed project errors are small `Error` subclasses carrying machine-readable context, e.g. `CapabilityUnavailableError` (`resolve-command-center/capability/errors.js:1-15`).
- Existing Feature readiness vocabulary (`ready`, `missing-dependency`, `unavailable`) is a UI/lifecycle contract (`resolve-command-center/feature-status/FeatureStatusManager.js:1-54`), not a runtime compatibility contract. Do not import or overload it in the new resolver.

### Repository resource-area finding

There is no existing general backend resource directory. Current repository-owned metadata lives beside its owner (`capability/definitions/`, `command-engine/commands/`), while `electron/renderer/assets/` is renderer-only. The least ambiguous future bundle boundary is a new application-root `resources/runtimes/`:

- `resources/runtimes/manifest.json` is versioned metadata committed in Phase 6.5A.
- Managed executable paths are relative to that directory.
- `resources/runtimes/python/...` may remain absent in Phase 6.5A; absence is a normal `RUNTIME_NOT_FOUND`, not an invalid manifest.
- Vite only emits the renderer to `dist/renderer` (`resolve-command-center/vite.config.mjs:15-18`), and there is no Electron packaging configuration. Phase 6.5A should not add packaging changes; a later bundling phase must copy `resources/runtimes/` and preserve its relative layout.

### Recommended Runtime Manifest schema (version 1)

```json
{
  "schemaVersion": 1,
  "profiles": [
    {
      "id": "python-cpython-3.13.1-resolve-20.3.2-win32-x64",
      "runtime": "python",
      "implementation": "cpython",
      "runtimeVersion": "3.13.1",
      "platform": "win32",
      "architecture": "x64",
      "capabilities": ["ae.export"],
      "host": {
        "application": "davinci-resolve",
        "versionPrefix": "20.3.2"
      },
      "executable": "python/cpython-3.13.1/win32-x64/python.exe",
      "verification": "machine-verified"
    }
  ]
}
```

Why this exact shape:

- `schemaVersion` versions the file contract. Phase 6.5A accepts integer `1` only; an unknown version fails closed with `RUNTIME_MANIFEST_INVALID`.
- `runtime: "python"` matches existing Capability executor metadata; `implementation: "cpython"` records the actually verified implementation rather than implying every Python implementation is compatible.
- `runtimeVersion` is exact (`3.13.1`), not the selector string `3.13.x`. Managed artifacts need an exact identity and deterministic ranking. It is the machine-verified member of the required 3.13.x line.
- Platform and architecture use Node's canonical tokens (`process.platform === "win32"`, `process.arch === "x64"`) so no alias-normalization layer is needed.
- `capabilities` contains exact Capability ids. No wildcard is needed in this phase.
- `host.versionPrefix: "20.3.2"` is the smallest matcher that covers both the compatibility release and Resolve executable build `20.3.2.9`. Match parsed numeric components, not raw string prefixes: the actual version must have at least the prefix's component count and its first three components must equal `[20, 3, 2]`. This matches `20.3.2` and `20.3.2.9`, but not `20.3.20`; it avoids invented semver range/wildcard semantics.
- `executable` is a forward-slash relative resource path. An absolute path, bare name, empty segment, or path escaping `resources/runtimes/` is invalid manifest data. The committed manifest must not contain the verifying user's `C:\Users\...` path.
- `verification` accepts `"machine-verified"` in schema version 1. Do not add speculative verification states until another source exists.

Required loader/registry validation:

1. Root is a plain object, `schemaVersion === 1`, and `profiles` is a non-empty dense array.
2. Every scalar field above is a non-empty string; `id` is unique.
3. `runtimeVersion` is exactly three canonical numeric components (`major.minor.patch`). `host.versionPrefix` is a canonical numeric dotted string with at least three components.
4. `capabilities` is a non-empty, dense, unique array of non-empty strings.
5. `host` is a plain object containing only the required application/version data.
6. `platform`, `architecture`, and `verification` use the supported version-1 vocabulary. Reject unknown values; do not silently normalize them.
7. `executable` is relative and resolves lexically inside `runtimeRoot`. Do not require the file to exist during registry load.
8. Validate every profile before returning a registry. JSON parse errors, missing manifest, unknown schema version, duplicates, and malformed entries are wrapped in one actionable typed error naming the manifest/profile/field.
9. The registry sorts its internal records by `id`, clones input on construction, and returns a fresh `structuredClone` from `get(id)` / `getAll()`.

### Recommended module contracts

`errors.js`:

```text
RuntimeError(code, message, { supportStatus = null, details = {} } = {})
  -> Error with name="RuntimeError", code, supportStatus, defensive details
```

Version-1 error codes:

| Code | When | `supportStatus` |
|---|---|---|
| `RUNTIME_MANIFEST_INVALID` | Missing/unparseable manifest, unsupported schema, malformed/duplicate profile, or managed path escape | `null` |
| `RUNTIME_REQUEST_INVALID` | Missing/malformed platform, architecture, runtime, Capability, host application, or host version | `null` |
| `RUNTIME_OVERRIDE_INVALID` | Override is not one absolute executable-only path (for example a bare name, relative path, array, or command-with-arguments) | `null` |
| `RUNTIME_UNSUPPORTED` | No verified profile matches all request selectors | `unsupported` |
| `RUNTIME_NOT_FOUND` | The override file or selected managed executable is absent/not a regular contained file | `missing-runtime` |

One `RuntimeError` class plus codes is smaller and easier for callers to serialize than five subclasses, while still giving `instanceof RuntimeError` and exact machine-readable failure types.

`loader.js`:

```text
DEFAULT_RUNTIME_ROOT = <app root>/resources/runtimes
loadRuntimeRegistry({ runtimeRoot = DEFAULT_RUNTIME_ROOT, fileSystem = fs } = {})
  -> reads runtimeRoot/manifest.json synchronously
  -> validates the versioned envelope
  -> returns createRuntimeRegistry({ profiles, runtimeRoot })
  -> throws RuntimeError
```

Synchronous loading matches current startup-time Capability discovery. There is no need for async I/O, directory watching, caching, or JSON Schema/Ajv.

`registry.js`:

```text
createRuntimeRegistry({ profiles, runtimeRoot })
  -> validates all profiles atomically
  -> { get(id): clonedProfile|null, getAll(): clonedProfile[] }
```

Registry records may include an internal absolute `executablePath` derived from the validated relative manifest value. Public snapshots should keep both the manifest `executable` and the resolved absolute candidate if the resolver needs it, but never mutate or rewrite manifest data.

`resolver.js`:

```text
new RuntimeResolver({ registry, fileSystem = fs }).resolve({
  runtime,
  platform,
  architecture,
  capabilityId,
  host: { application, version },
  overrideExecutable
}) -> resolution record or throws RuntimeError
```

Manifest success:

```json
{
  "source": "manifest",
  "supportStatus": "machine-verified",
  "executable": "<absolute contained file path>",
  "profile": "<defensive profile snapshot>"
}
```

Override success:

```json
{
  "source": "override",
  "supportStatus": "overridden",
  "executable": "<absolute regular file path>",
  "profile": null
}
```

The support vocabulary should be exactly `machine-verified`, `overridden`, `unsupported`, and `missing-runtime`. `overridden` is intentionally distinct from `machine-verified`: checking that an arbitrary override path is a file does not prove ABI compatibility, and Phase 6.5A explicitly does not launch/probe Python.

### Deterministic resolver algorithm

1. If `overrideExecutable` is provided, handle it before request validation or registry selection. Require one absolute string path and a regular file. Return it immediately. If invalid or missing, throw its typed error immediately; never continue to registry selection.
2. Validate the normal request fields.
3. Read defensive profiles and retain only exact matches for `runtime`, `platform`, `architecture`, `capabilities.includes(capabilityId)`, and `host.application`, then component-prefix match `host.version` against `host.versionPrefix`.
4. If none match, throw `RUNTIME_UNSUPPORTED` with the normalized request in `details`. No filesystem or process probe is required for this classification.
5. Sort matches by numeric dotted `runtimeVersion` descending, then `id` ascending. Select the first. Numeric comparison must make `3.13.10` newer than `3.13.9`; lexical comparison must not choose the runtime version.
6. Check the selected executable only now. Require an existing regular file; resolve symlinks and confirm the real path remains inside `runtimeRoot`. Otherwise throw `RUNTIME_NOT_FOUND` with `source: "manifest"`, `profileId`, and candidate path.
7. Return the absolute executable and defensive profile with `supportStatus: "machine-verified"` (copied from the selected profile's `verification`).

This is deterministic independent of manifest array order and does not need `priority`, semver ranges, wildcard matchers, or ambiguity errors. Highest exact managed runtime version is the only useful current preference; lexical id is a stable final tie-break. If future profiles need policy other than “newest verified compatible runtime,” schema version 2 can add explicit priority.

There must be no call to `spawn`, `exec`, `which`, `where`, `Get-Command`, the Windows registry, PATH lookup, `python`, `python3`, or `py`. Every successful result contains an absolute file path. Override never accepts arguments. The legacy bridge variable remains out of scope because it is a command string, not an executable path.

### Support-status behavior matrix

| Situation | Result/error | Status | Fallback |
|---|---|---|---|
| Matching verified profile and executable file exists | manifest resolution | `machine-verified` | none |
| Explicit absolute override file exists | override resolution | `overridden` | registry not read |
| Explicit override missing | `RUNTIME_NOT_FOUND` | `missing-runtime` | none |
| Explicit override malformed/relative | `RUNTIME_OVERRIDE_INVALID` | `null` | none |
| Platform/architecture/runtime/Capability/host/version mismatch | `RUNTIME_UNSUPPORTED` | `unsupported` | none |
| Profile matches but managed file is absent | `RUNTIME_NOT_FOUND` | `missing-runtime` | none |
| Manifest/schema/profile is malformed | `RUNTIME_MANIFEST_INVALID` | `null` | none |

The resolver returns one verified profile or one typed failure. It never returns a “best effort” bare executable and never retries a lower profile after choosing a matching profile whose files are missing; doing so would hide an incomplete managed installation.

### Machine verification performed 2026-08-03

Read-only checks reconfirmed the prior crash research on the current Windows machine:

| Item | Observed value |
|---|---|
| Resolve executable | `C:\Program Files\Blackmagic Design\DaVinci Resolve\Resolve.exe`, product/file version `20.3.2.9`, 64-bit installation |
| Native bridge | `C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll`, product/file version `20.3.2` |
| Verified interpreter | `C:\Users\Administrator\AppData\Local\Programs\Python\Python313\python.exe`, CPython `3.13.1`, `AMD64`, 64-bit |
| Resolve Python loader | standard ProgramData `DaVinciResolveScript.py` |
| Compatibility probe | explicit CPython 3.13.1 imported `DaVinciResolveScript`, `scriptapp("Resolve")` returned `PyRemoteObject`, exit `0` |

Probe command shape:

```powershell
& 'C:\Users\Administrator\AppData\Local\Programs\Python\Python313\python.exe' -X faulthandler -c "import sys; sys.path.insert(0, r'C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules'); import DaVinciResolveScript as d; app=d.scriptapp('Resolve'); print(type(app).__name__ if app else 'None'); assert app"
```

This verifies the compatibility tuple encoded by the profile. The manifest must still point to a future repository-managed relative executable, not this user installation. Because Phase 6.5A commits no runtime binary, resolving the real manifest should currently produce `RUNTIME_NOT_FOUND` after selecting this profile.

### Expected affected files for implementation

Minimum product/test surface:

- `resolve-command-center/resources/runtimes/manifest.json` — schema version 1 and the single verified profile; no executable binary.
- `resolve-command-center/script-runtime/runtime/errors.js` — `RuntimeError` and codes.
- `resolve-command-center/script-runtime/runtime/loader.js` — fixed resource loading and envelope validation.
- `resolve-command-center/script-runtime/runtime/registry.js` — atomic profile validation and defensive lookup.
- `resolve-command-center/script-runtime/runtime/resolver.js` — override-first filtering, ranking, file check, results/status.
- `resolve-command-center/script-runtime/runtime.test.js` — focused loader/registry/resolver tests while remaining under the current `npm test` glob.
- `.trellis/spec/backend/quality-guidelines.md` — later spec-workflow update documenting the settled runtime-selection contract.

Files explicitly not affected in Phase 6.5A:

- `script-runtime/providers/PythonProvider.js`
- `capability/registerScripts.js`
- `electron/main/main.js`
- `workflow-plugin/main.js`
- `ScriptExecutor.js`, Feature/Capability manifests, renderer, Resolve adapter, Resolve2AE wrapper/core, and all Python files

The next-phase integration point is exactly `registerScriptCapabilities({ pythonExecutable })` (`resolve-command-center/capability/registerScripts.js:10-27`). A later composition phase resolves once and injects `resolution.executable`; it should not teach `PythonProvider` about manifests, hosts, capabilities, or PATH discovery.

### Required focused checks

1. Loader/registry: valid real manifest, missing/unparseable manifest, unsupported schema, every missing/malformed field, duplicate ids/array entries, relative-path escape, and defensive input/output mutation.
2. Resolver selectors: independently mismatch runtime, platform, architecture, Capability, host application, and host version; each yields `RUNTIME_UNSUPPORTED` without process launch.
3. Determinism: shuffled profiles still choose highest numeric `runtimeVersion`, then lexical id; include `3.13.10` versus `3.13.9` to catch lexical sorting.
4. Override: valid absolute file wins without touching registry; missing override yields `RUNTIME_NOT_FOUND`; malformed/bare/argument-bearing override yields `RUNTIME_OVERRIDE_INVALID`; neither falls through.
5. Managed file: matching profile plus absent/non-file/symlink-escape candidate yields `RUNTIME_NOT_FOUND` with selected profile id; contained file returns an absolute path.
6. Status: assert `machine-verified`, `overridden`, `unsupported`, and `missing-runtime` mapping directly; no Python probe is used.
7. Boundary: assert no success returns `python`, `python3`, `py`, or any relative path; assert production JS outside the manifest contains no `3.13` compatibility constant.
8. Regression: existing PythonProvider and full project tests remain untouched in behavior.

Suggested validation commands from `resolve-command-center/`:

```powershell
node --test script-runtime/runtime.test.js
npm test
npm run build
node -e "const { loadRuntimeRegistry } = require('./script-runtime/runtime/loader'); const r = loadRuntimeRegistry(); console.log(r.getAll())"
rg -n 'spawn|execFile|execSync|python3|\bpy\b|PATH' script-runtime/runtime resources/runtimes
rg -n '3\.13' --glob '!resources/runtimes/manifest.json' --glob '!*.test.js' script-runtime capability electron workflow-plugin scripts
git diff --check
```

The loader smoke command should load metadata successfully even though the managed executable is absent. A resolver smoke request against the real manifest should assert `RUNTIME_NOT_FOUND`, not success or PATH fallback.

### Files found

- `resolve-command-center/script-runtime/providers/PythonProvider.js` — current process owner, literal PATH default, and executable injection seam.
- `resolve-command-center/script-runtime/providers/PythonProvider.test.js` — current constructor/transport behavior and PATH-default regression.
- `resolve-command-center/script-runtime/ScriptExecutor.js` — runtime-name provider dispatch.
- `resolve-command-center/script-runtime/ScriptCapabilityProvider.js` — Capability-to-runtime context boundary.
- `resolve-command-center/capability/registerScripts.js` — shared composition and later integration point.
- `resolve-command-center/capability/loader.js` — sorted JSON loader/clone/duplicate pattern.
- `resolve-command-center/capability/registry.js` — private-Map registry pattern.
- `resolve-command-center/capability/errors.js` — typed project error pattern.
- `resolve-command-center/capability/afterEffectsPath.js` — numeric dotted version comparison using Node built-ins.
- `resolve-command-center/feature-status/FeatureStatusManager.js` — existing UI readiness vocabulary, intentionally not reused.
- `resolve-command-center/electron/main/main.js` and `workflow-plugin/main.js` — two current callers that omit interpreter injection.
- `resolve-command-center/package.json` — existing test discovery globs and no schema/semver dependency.
- `resolve-command-center/vite.config.mjs` — renderer-only build; no runtime resource packaging.
- `.trellis/tasks/archive/2026-07/07-31-phase-6-script-runtime/{prd.md,design.md,research/current-script-runtime-boundary.md}` — original runtime ownership and minimal stdlib design.
- `.trellis/tasks/archive/2026-08/08-03-resolve2ae-clackly-refactor/{prd.md,design.md,research/current-state.md}` — Feature integration and earlier PATH/discovery limitation.
- `.trellis/tasks/08-03-fix-resolve2ae-export-crash/research/{crash-boundary.md,local-runtime-evidence.md}` — native crash localization and verified interpreter comparison.

### External references and versions

- Installed Blackmagic documentation: `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\README.txt:14-42`, last updated 2025-10-07. It documents 64-bit Python `>=3.6`, Resolve-running requirement, and standard Windows API/library/module paths. The observed crash proves that broad vendor minimum is not a safe compatibility selector for this native bridge.
- Installed loader: `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules\DaVinciResolveScript.py`. It dynamically loads `fusionscript.dll`; prior fault-handler evidence reaches this boundary.
- Runtime used for implementation/tests today: Node `v22.17.1`, npm `11.13.0`.
- Machine compatibility tuple: Resolve executable `20.3.2.9`, `fusionscript.dll` `20.3.2`, CPython `3.13.1` AMD64/64-bit.

### Related specs

- `.trellis/spec/backend/quality-guidelines.md:111-176` — Script Capability Runtime signatures, process ownership, error matrix, executable-only injection, no retry, and required tests.
- `.trellis/spec/backend/quality-guidelines.md:131-144` — sorted manifests, entry containment, and separation of the bridge command from PythonProvider customization.
- `.trellis/spec/guides/code-reuse-thinking-guide.md` — reuse existing loader/registry/path/version patterns before adding helpers; avoid abstractions used once.
- `.trellis/spec/backend/error-handling.md` and `directory-structure.md` remain placeholders, so they add no project-specific error/layout contract.

## Caveats / Not Found

- No current code obtains the host application's version for this resolver. Phase 6.5A should accept it as request data. The component-prefix matcher deliberately accepts either observed Resolve executable version `20.3.2.9` or normalized bridge release `20.3.2`.
- The compatibility probe proves one machine and one exact tuple, not a universal Resolve/Python compatibility range. Do not broaden the profile to all Resolve 20.x or all Python `>=3.13`.
- An override can be checked as an absolute regular file without launching it, but its interpreter identity and ABI compatibility remain unverified. This is why `overridden` must not be mislabeled `machine-verified`.
- No runtime executable is currently stored in the repository. The Phase 6.5A profile should load successfully but resolve to `RUNTIME_NOT_FOUND` until a later bundling/install phase supplies the exact relative file.
- There is no packaging/copy pipeline for backend resources. Adding one is outside Phase 6.5A and must be designed with the launcher/bundling phase.
- No existing semver dependency or general version matcher was found. Numeric component-prefix host matching plus numeric runtime-version ordering satisfies current requirements with standard library code.
- No evidence supports modifying Resolve2AE, the Resolve adapter, Python runner, Feature UI, or current provider composition during this metadata-only phase.
