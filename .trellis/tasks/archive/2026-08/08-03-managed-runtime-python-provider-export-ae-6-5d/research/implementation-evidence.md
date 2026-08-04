# 6.5D implementation evidence — 2026-08-03

## Locked upstream inputs

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `python-3.13.14-embed-amd64.zip` | 10,964,839 | `90b4e5b9898b72d744650524bff92377c367f44bd5fbd09e3148656c080ad907` |
| `python-3.13.14-embed-amd64.zip.sigstore` | 5,503 | `ec9e3f2bb3d21f80d17c43b3fbc93aed0abc98e10912e8dbd744c41c3d797597` |
| `python-3.13.14-embed-amd64.zip.spdx.json` | 15,341 | `ff85d80144dffbd3a3498a4bce568f6ab3fec614842eafda2b562f4c4e9bd247` |
| CPython `v3.13.14/LICENSE` | 13,809 | `78b12c3a81360b357002334f0e70ea0e92eebf7a9b358805c03c48484945f3bb` |

Every URL and digest is committed in `resources/runtimes/python-win32-x64.lock.json`.

## Automated package evidence

- `npm test` passed 154 Node tests and Python suites of 3 bridge, 15 Resolve,
  15 Script Runtime, 19 Resolve2AE, and 2 export-entry tests.
- Packaged CPython passed 15 Script Runtime and 19 Resolve2AE tests and compiled all
  8 staged production Python sources.
- `npm run runtime:stage` succeeded from the hash-verified cache.
- `npm run package:win` produced `release/win-unpacked` with the Runtime outside asar.
- `npm run package:verify` inventoried one `python.exe`, matching lock/Manifest/runtime metadata, licenses/notices, upstream SPDX/Sigstore, application SPDX, `_pth`, and staged Clackly sources.
- Packaged `runtime-info` returned CPython `3.13.14`, `64bit`, and the packaged absolute executable while the parent supplied hostile Python 3.11/Conda/venv/PYTHONHOME values.
- Full-scope review added fail-closed rejection for staging outputs beneath junctions,
  strict handling of an explicitly supplied Bootstrap path, and an HTTP-level regression
  for the live-version `/health` contract; all affected and full gates passed afterward.

## Post-fix alternate package evidence — 2026-08-04

- The output target resolved to
  `D:\Clackly\resolve-command-center\build\package-host-launch-fix-20260804`, was
  absent before packaging, remained beneath the ignored `build` root, and traversed no
  existing reparse-point ancestor. The in-use `release` tree was not changed.
- `npm run runtime:stage`, `npm run build`, and electron-builder Windows directory
  packaging all passed. The fresh artifact is under that target's `win-unpacked` tree.
- `npm run package:verify -- build/package-host-launch-fix-20260804/win-unpacked`
  passed the existing inventory, metadata/hash/license/SBOM, unpacked Workflow
  Integration layout, sibling Runtime resolution, and hostile-environment runtime-info
  checks. It reported packaged CPython `3.13.14` x64 from the alternate artifact.
- That packaged interpreter passed 15 Script Runtime tests and 19 Resolve2AE tests;
  all 8 packaged production Python sources compiled without writing bytecode.
- SHA-256 comparison confirmed the alternate package contains the current
  `capability/afterEffectsLaunch.js`, `script-runtime/runtime/manager.js`, and
  `resolve2ae_core/export.py` bytes.
- No Resolve or After Effects process was launched, stopped, or otherwise manipulated.
  This was automated package evidence only; the post-fix live gate was still pending at
  that point.

## Live qualification state

- Resolve loaded `com.wutpeach.clackly` through Resolve Electron 36.3.2 from the final
  `release/win-unpacked/resources/app` packaged junction; the Resolve log recorded the
  plugin load and interface version 2.
- Packaged CPython 3.13.14 ran an isolated Probe miss followed by a cache hit. Both passed
  with Resolve `20.3.2.9`, `connected=true`, and the canonical module/library paths.
- A sanitized read-only selection check confirmed one current video clip at 24 fps. The
  managed `RuntimeManager` send returned `ok=true`, `code=exported`, `mode=single`, and
  `clip_count=1`; After Effects consumed and self-deleted the generated JSX. The user also
  explicitly confirmed their manual real Export-to-AE result succeeded for this selection.
- The first hostile no-PATH repetition reached the same successful Python export envelope,
  then failed Runtime temp cleanup because Python had launched After Effects with the
  worker's intentional `SystemRoot/WINDIR/TEMP/TMP` environment. The user observed AE
  Preferences read/write and CEP-suite load errors before AE exited.
- The root fix keeps the Runtime allowlist unchanged: Python now returns only a declarative
  internal JSX plan; the Electron host validates and starts AE once with its normal desktop
  environment, and `RuntimeManager` strips the plan while restoring the existing public
  result/log contract. Focused host/Manager/Provider/Python tests pass.

At this stage the post-fix live AE retest had not yet run, so the lock and Manifest
correctly remained `candidate` pending later acceptance evidence.

## Full-scope review evidence — 2026-08-04

- Review fixed fail-open desktop preparation diagnostics: raw filesystem/process codes can
  no longer replace the public `AFTER_EFFECTS_LAUNCH_FAILED` contract, while bounded
  `causeCode` remains available. Cold startup now creates its bootstrap exclusively and
  removes it only when the current launch created it, so a pre-existing file is neither
  overwritten nor deleted.
- Runtime-root resolution now checks the plugin-local copied layout and packaged sibling
  layout before any unrelated Resolve-owned resources. Tests cover packaged Junction and
  Copy installs plus a misleading Resolve `resourcesPath` containing its own Manifest.
- Focused host/Manager/integration/installer/Python tests passed. Full `npm test` passed
  155 Node tests and Python suites of 3 bridge, 15 Resolve, 15 Script Runtime, 19 Resolve2AE,
  and 2 export-entry tests. Vite build, application SPDX generation, Node syntax, boundary
  searches, and `git diff --check` passed.
- A fresh non-reparse output at
  `build/package-check-review-final-20260804/win-unpacked` passed electron-builder and
  `package:verify`. Its CPython 3.13.14 x64 passed 15 Script Runtime and 19 Resolve2AE tests,
  compiled all 8 staged production Python sources without bytecode output, and contained
  byte-identical current launcher/Manager/Runtime-path/export sources.
- No Resolve or After Effects process was launched, stopped, or manipulated during review.
  At review time the post-fix live warm/cold gate was still pending and `releaseStatus`
  correctly remained `candidate`.

## Post-fix manual acceptance and final release decision — 2026-08-04

- The user confirmed the final packaged Workflow Integration completed Export to After
  Effects with AE already running and with AE closed and launched by the Electron host.
- The Preferences/CEP errors observed before the host-launch fix did not recur in either
  case. This evidence is intentionally sanitized and records no project or media names.
- The user explicitly approved the final release decision that another actual GUI send
  from a hostile parent is unnecessary because the relevant boundaries are proven
  independently: the final packaged Runtime identity/package verifier passes under hostile
  PATH/Conda/Python settings; the host-owned AE launcher cannot inherit the isolated
  Runtime worker environment; and the post-fix warm/cold real exports both passed without
  Preferences/CEP recurrence.
- This decision does not waive Runtime isolation or real-GUI validation. It avoids
  duplicating both in one additional run after each has already passed at its owning
  boundary.
- CPython 3.13.14 is selected as `releaseStatus: current`; the historical 3.13.1 fallback
  was not selected, so no legacy security-upgrade blocker was created.
- With Resolve and After Effects closed, `npm run runtime:stage` and the final
  `npm run package:win` rebuilt canonical `release/win-unpacked`; no GUI or export was
  launched. `npm run package:verify` passed the exact Runtime inventory, metadata,
  license/SBOM, sibling-resource resolution, and hostile Python
  3.11/Conda/venv/PYTHONHOME runtime-info checks.
- Source, staged, and packaged lock hashes match at
  `93b4bb5713da4366af4a047c2901cb0bc49cd00c86eed373e6a27752776d9f97`;
  Manifest hashes match at
  `4142f273b4240ead82b01bd327d5d575ba000086c341208009c7f4c2cd251099`;
  staged and packaged `runtime.json` hashes match at
  `9a3cb944d6c6e00c3ae717221d3ba4ced479f333f047640d9e0bf86949a1a6de`.
  All projections report CPython `3.13.14` / `current`.
- Focused Runtime/Manager/host-launch/integration/staging tests passed 32/32. Full
  `npm test` passed 155 Node tests and Python suites of 3 bridge, 15 Resolve, 15 Script
  Runtime, 19 Resolve2AE, and 2 export-entry tests.
- Final packaged CPython passed 15 Script Runtime and 19 Resolve2AE tests and compiled all
  8 packaged production Python sources without bytecode output.
