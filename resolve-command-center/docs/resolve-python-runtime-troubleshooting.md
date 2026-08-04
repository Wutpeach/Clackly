# Managed Runtime troubleshooting

| Code/status | Meaning | Action |
| --- | --- | --- |
| `RUNTIME_MANIFEST_INVALID` | Manifest/lock metadata cannot be trusted. | Reinstall or restage from committed inputs. |
| `RUNTIME_REQUEST_INVALID` | Runtime/Capability/host request is malformed. | Check host composition; Features must not supply versions. |
| `RUNTIME_PROBE_REQUEST_INVALID` | Probe inputs or bridge paths are malformed. | Repair host composition or the Resolve installation paths. |
| `RUNTIME_OVERRIDE_INVALID` | `CLACKLY_PYTHON_EXECUTABLE` is not one absolute executable path. | Remove it or set an existing `python.exe` without arguments. |
| `RUNTIME_UNSUPPORTED` | No profile matches the live host tuple. | Use a qualified Clackly/Resolve combination; do not add PATH fallback. |
| `RUNTIME_NOT_FOUND` / `missing-runtime` | Selected payload or Override is absent. | Reinstall/restage; run `npm run package:verify` for build artifacts. |
| `RUNTIME_LAUNCH_REQUEST_INVALID` / `RUNTIME_EXECUTABLE_INVALID` | Launcher input, Bootstrap, or selected executable changed or is invalid. | Verify the complete package and reinstall it. |
| `RUNTIME_SPAWN_FAILED` / `RUNTIME_STDIN_FAILED` / `RUNTIME_PROCESS_EXITED` | The isolated worker could not start, receive its request, or exited normally with failure. | Inspect bounded process diagnostics and reinstall if files changed. |
| `RESOLVE_VERSION_UNVERIFIED` | Host could not return a canonical live Resolve version. | Start Resolve and use Workflow Integration or a healthy bridge. |
| `RESOLVE_MODULE_NOT_FOUND` / `RESOLVE_LIBRARY_NOT_FOUND` | Official scripting bridge files are absent. | Repair/install Resolve scripting support. |
| `RESOLVE_NOT_RUNNING` | Bridge loaded but could not connect. | Start Resolve Studio and enable external scripting. |
| `RESOLVE_IMPORT_FAILED` / `RESOLVE_CONNECTION_FAILED` | Resolve bridge load/connection failed. | Check Resolve install and exact bridge paths; rerun a forced Probe. |
| `RUNTIME_VERSION_MISMATCH` / `RUNTIME_ARCHITECTURE_UNSUPPORTED` | Worker identity differs from the selected profile or is not x64. | Reinstall the locked Runtime; never substitute another Python. |
| `RUNTIME_NATIVE_BRIDGE_CRASH` | Resolve native bridge terminated only the worker. | Restart Resolve, rerun once, and retain bounded diagnostics. Clackly remains alive. |
| `RUNTIME_NATIVE_CRASH` | Business execution terminated the isolated worker abnormally. | Retain diagnostics; do not retry an export automatically. |
| `AFTER_EFFECTS_LAUNCH_INVALID` | The internal launch plan, configured executable, fixed arguments, or JSX boundary failed validation. | Verify `ae.export.aePath` and reinstall matching application/Runtime files; do not run the plan manually. |
| `AFTER_EFFECTS_LAUNCH_FAILED` | The Electron host could not prepare or start After Effects once. | Check host desktop permissions and the configured AE installation; no automatic retry occurs. |
| `RUNTIME_TIMEOUT` / `RUNTIME_OUTPUT_LIMIT` | Worker exceeded its process boundary. | Inspect bounded process diagnostics; do not retry an export automatically. |
| `RUNTIME_PROTOCOL_EMPTY` / `RUNTIME_PROTOCOL_INVALID` | Bootstrap returned no envelope or an incompatible one. | Verify package integrity and matching Clackly sources. |
| `RUNTIME_BOOTSTRAP_FAILED` / `BOOTSTRAP_REQUEST_INVALID` | Bootstrap rejected the operation or its input. | Inspect the nested Bootstrap error and verify matching application/Runtime files. |
| `RUNTIME_TEMP_CLEANUP_FAILED` | Launcher could not remove its temporary directory. | Stop Clackly, remove the named temporary directory, and check permissions. |
| `RUNTIME_PROBE_FAILED` | Probe failed without a more specific stable code. | Retain diagnostics and verify the Runtime and Resolve installation. |
| `CACHE_READ_FAILED` / `CACHE_WRITE_FAILED` / `CACHE_CLEAR_FAILED` | Probe cache persistence failed; the primary Probe result remains authoritative. | Stop Clackly, remove the cache file, and check `%APPDATA%` permissions. |
| `CUSTOM_RUNTIME_UNVERIFIED` | Override passed this machine Probe but is not a released combination. | Use only for diagnosis; restore the managed Runtime for release use. |

Build and package failures are also fail-closed:

| Message/check | Meaning | Action |
| --- | --- | --- |
| `Runtime lock is missing or malformed` / `unsupported identity metadata` | The versioned build input is absent or invalid. | Restore the committed lock; do not hand-edit staged metadata. |
| `must use HTTPS and a lowercase SHA-256` / `SHA-256 mismatch` | An upstream record or cached file is not the locked input. | Remove the named cache file and fetch the exact official asset again. |
| `Managed Runtime payload is incomplete` | The verified archive lacks a required embedded-Python file. | Stop the build and retain the asset/hash evidence. |
| `Runtime staging output must stay under` / `must not traverse a link` | The requested recursive-replacement target is unsafe. | Use the default `build/runtime-staging/runtimes` directory without junctions. |
| `npm application SBOM generation failed` | The committed npm lock could not produce the required application SBOM. | Repair the npm/lockfile error before packaging. |
| `package:verify` assertion failure | Runtime inventory, metadata, licenses, source staging, or packaged execution differs. | Discard the artifact, restage, repackage, and rerun verification. |
| Clackly is absent from `Workspace > Workflow Integrations` | Resolve did not scan a valid plugin module at startup. | Run `npm run workflow:install:package`, confirm `manifest.xml` under `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.wutpeach.clackly`, then restart Resolve. Do not install under `%APPDATA%`. |

Probe cache deletion is safe: remove `%APPDATA%\Clackly\runtime-probe.json` while
Clackly is stopped, then the next request will Probe again. Never fix Runtime failures by
adding Python, Conda, uv, or virtual-environment directories to `PATH`.

Rollback is a full Clackly build rollback. A released rollback must still package its
locked Runtime and must not restore the legacy bare-`python` provider.
