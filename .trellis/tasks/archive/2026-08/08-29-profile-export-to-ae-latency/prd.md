# Profile Export to AE Latency

## Goal

Identify which stages make the real DaVinci Resolve to After Effects command take more than one second, so later optimization targets measured bottlenecks without changing export correctness.

## Background

- The user observes more than one second between triggering Export to AE in Resolve and the export being sent to After Effects.
- The command is a serial cross-process pipeline: Electron interaction/command dispatch, Resolve version and managed-runtime readiness, isolated Python execution, Resolve timeline and OTIO work, JSX generation, After Effects process detection, and desktop launch/send.
- The Runtime Launcher currently records only one aggregate Python-process `durationMs`; successful execution does not expose phase-level timings.
- The normal machine has a valid managed-runtime Probe cache. A cache hit avoids a second Python Probe process, but the cache lookup and Resolve version read still occur on every command.
- A read-only local baseline of the exact Windows After Effects process-detection command took 341–518 ms across five runs. This is a confirmed contributor, not yet proof of the dominant end-to-end bottleneck.

## Requirements

- Measure end-to-end command latency using one correlation id and monotonic timestamps across the Electron, managed-runtime, Python, Resolve/OTIO, and After Effects launcher boundaries.
- Separate at least these phases: command dispatch; Resolve host-version/readiness; runtime resolution and Probe cache disposition; isolated Python process startup/total; Resolve connection/project acquisition; target clip scan; OTIO export; OTIO parse; per-clip data and JSX generation; AE plan validation/temp write; AE running-state detection; and AE process spawn acknowledgement.
- Preserve the existing export result, error contract, command bindings, range policies, generated JSX behavior, runtime isolation, and AE warm/cold launch behavior while profiling.
- Profiling output must be bounded, contain no timeline media paths, no JSX body, and no arbitrary configuration values.
- Collect repeated samples from the real packaged Workflow Integration in a local Resolve project. Report warm-up separately from steady-state runs and identify cache hit/miss and AE running/cold state for every sample.
- Treat AE-already-running exports as the primary baseline. Compare the default mixed export, audio-only action, and video-only action on the same representative timeline/selection; use AE-closed execution only as a labeled qualitative control.
- Use the evidence to rank bottlenecks and propose optimizations with estimated upside and correctness risk. Optimization implementation is a later decision and is not implied by this task.

## Acceptance Criteria

- [ ] At least five comparable steady-state real-host samples produce a complete timing breakdown whose named phases account for the end-to-end duration within a documented small measurement gap.
- [ ] The report distinguishes Python cold-start cost, Resolve/OTIO work, and After Effects process detection/send instead of reporting only a single total.
- [ ] Probe cache status and AE running/cold state are visible in each sample, so cache misses and application startup are not misattributed to export logic.
- [ ] The report identifies the top contributors with measured median/range values and recommends the next optimization experiment without claiming unmeasured savings.
- [ ] Existing automated tests remain green, and a before/after export-result comparison confirms that profiling does not alter the command result or generated AE launch plan apart from internal timing metadata/logging.
- [ ] Profiling instrumentation is removed after evidence capture, the clean Workflow package is rebuilt and reinstalled, and only bounded task evidence remains.

## Out of Scope

- Changing Resolve2AE export formulas, selection behavior, OTIO interpretation, or generated JSX semantics.
- Implementing a persistent Python worker, caching Resolve timeline data, replacing PowerShell process detection, or otherwise optimizing before measurements identify the bottleneck.
- Using network Resolve project libraries for smoke tests.
- Treating After Effects cold application startup or its scheduled three-second bootstrap as ordinary warm-send latency.
