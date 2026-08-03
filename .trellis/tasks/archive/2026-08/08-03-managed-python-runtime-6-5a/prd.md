# Phase 6.5A Runtime Registry 与 Resolver

## Goal

Establish the data model and deterministic selection layer for Clackly Managed Python Runtime without changing the production Python execution path. Later phases must be able to request a compatible runtime and receive one verified profile or a typed failure, never an implicit PATH fallback.

## Background

- Current architecture is `Capability -> Execution Provider -> Script Runtime -> PythonProvider`.
- `PythonProvider` currently may select Python through PATH or host environment and already accepts an executable-only constructor override.
- The Resolve2AE crash task proved that PATH selection can mix an incompatible interpreter with Resolve's native Python bridge.
- Phase 6.5A defines runtime metadata and selection only. Runtime files may remain absent from the repository, and `PythonProvider` must remain unmodified by this phase.

## Requirements

- Define a versioned Runtime Manifest schema for managed Python runtime profiles.
- Implement a Runtime Registry that loads and validates manifest profiles from the repository-owned runtime resource area.
- Implement a Runtime Resolver that selects deterministically by platform, architecture, Capability, and host application/version conditions.
- Support an advanced executable-only Runtime Override with priority over manifest selection.
- Define typed Runtime Errors, including explicit `RUNTIME_NOT_FOUND` when a selected or overridden runtime executable is absent.
- Resolver must never fall back to PATH or return a bare executable name.
- Add one current-machine Runtime Profile with platform Windows, architecture x64, host DaVinci Resolve 20.3.2, machine-verified CPython 3.13.x x64, and verification `machine-verified`.
- Python 3.13 must exist only as Runtime Manifest data; Feature and Provider code must not hard-code it.
- Classify Runtime support status as `machine-verified`, `overridden`, `unsupported`, or `missing-runtime`; an arbitrary Override must not be presented as compatibility-verified.

## Acceptance Criteria

- [ ] Valid manifests load into defensive Runtime Registry records.
- [ ] Missing or malformed required manifest fields fail with typed, actionable errors.
- [ ] Resolver rejects platform, architecture, Capability, and host-version mismatches.
- [ ] A matching host version selects the deterministic current-machine profile.
- [ ] A valid Runtime Override wins over manifest selection.
- [ ] A missing Override executable fails explicitly and does not continue to registry or PATH selection.
- [ ] A selected profile whose runtime files are absent returns `RUNTIME_NOT_FOUND`.
- [ ] No-runtime resolution never invokes or returns PATH `python`/`python3`.
- [ ] Support Status classification is covered by focused tests.
- [ ] Existing PythonProvider and full project tests remain unchanged in behavior and pass.
- [ ] Completion report lists new modules, manifest structure, resolver flow, override rules, test results, and the next-phase integration point.

## Out of Scope

- Production Runtime Launcher.
- Resolve compatibility Probe and Probe Cache.
- Switching or modifying `PythonProvider` execution.
- Resolve2AE integration changes.
- DLL ABI detection.
- Downloading, installing, updating, or bundling Python runtime files.

## Key Decisions

- This is a standalone, independently verifiable Phase 6.5A task. Later launcher/probe/provider phases may become separate tasks when their requirements exist; no speculative parent tree is created now.
- Runtime metadata follows the existing synchronous JSON loader plus in-memory registry pattern, but uses one versioned Runtime Manifest and remains owned by `script-runtime/` rather than Capability Registry.
- Host compatibility uses an explicit version-prefix condition so the verified Resolve family `20.3.2` matches the installed host version `20.3.2.9` without introducing a general semver-range language.
- Override is authoritative: if supplied but invalid or missing, resolution fails and does not fall through to a Manifest or PATH candidate.
