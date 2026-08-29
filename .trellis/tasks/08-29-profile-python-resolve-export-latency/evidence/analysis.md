# Python and Resolve Real-Host Latency Analysis

## Evidence set

- Captured on 2026-08-29 from the packaged diagnostic Workflow Integration in a local Resolve project with After Effects already running.
- Raw evidence: `export-to-ae-profile-raw.jsonl`.
- Raw SHA-256: `B172838ED289082A72CB4FE08392E109DFF99CB2FE5327BBF5598610223D5047`.
- Nine valid records and zero malformed records: five successful default mixed exports and four successful audio-only exports.
- Every record used a Runtime Probe cache hit, reported AE state `running`, and targeted one clip on a timeline containing three video tracks with 18 items and three audio tracks with 15 items.
- The user approved stopping after these nine successful invocations because behavior appeared stable. No video-only sample and no AE-closed control were collected. This is an accepted sampling deviation, so conclusions about video-only savings remain deferred.
- No audio timeout occurred. The failure-safe transport was qualified by automated timeout tests but did not receive a real-host failure record in this session.

## End-to-end results

| Command | Samples | Command total median (range) | Python process median (range) | AE detection median (range) | AE spawn acknowledgement median (range) |
|---|---:|---:|---:|---:|---:|
| Default mixed | 5 | 464.559 ms (449.311-514.093) | 415.000 ms (402.000-458.000) | 9.507 ms (8.928-10.036) | 23.851 ms (23.653-24.239) |
| Audio-only | 4 | 470.011 ms (429.735-549.439) | 412.500 ms (381.000-480.000) | 10.983 ms (8.798-22.100) | 26.106 ms (23.349-28.909) |

The accepted persistent PowerShell helper is no longer a material bottleneck. Warm running-state detection is about 9-11 ms at the median in this host path, versus approximately 0.4-0.5 seconds in the original per-export PowerShell implementation.

## Python and Resolve phases

| Phase | Default mixed median (range) | Audio-only median (range) |
|---|---:|---:|
| Bootstrap and runner | 101.043 ms (97.177-111.698) | 103.615 ms (94.749-125.854) |
| Entry import/setup | 24.754 ms (22.610-43.587) | 24.474 ms (22.511-32.256) |
| AE path and LUT directory | 34.767 ms (33.917-36.251) | 43.739 ms (33.791-57.459) |
| Resolve connection | 32.004 ms (31.746-32.216) | 34.309 ms (31.040-38.024) |
| Project/timeline acquisition | 2.445 ms (2.087-3.247) | 2.461 ms (2.408-2.745) |
| Timeline metadata | 0.939 ms (0.923-1.159) | 1.113 ms (0.940-1.184) |
| Video-track scan | 8.976 ms (8.305-27.020) | 9.686 ms (8.851-15.318) |
| Audio-track scan | 7.704 ms (6.726-7.964) | 8.018 ms (6.362-12.773) |
| OTIO export | 7.242 ms (5.987-8.602) | not run |
| OTIO parse | 1.795 ms (1.287-1.882) | not run |
| Clip data and JSX | 2.465 ms (2.198-3.490) | 1.886 ms (1.541-3.884) |
| Result encoding | 0.026 ms (0.023-0.035) | 0.026 ms (0.024-0.027) |

The named in-worker phases sum to a 237.234 ms median for default and 231.565 ms for audio-only. The remaining measured outer Python-process gap is 183.752 ms (172.110-204.195) and 182.363 ms (175.316-195.564), respectively. It covers work outside the phase clock, including interpreter entry before Bootstrap timing, Node launcher setup, pipe/protocol work, child shutdown, and temporary-directory cleanup. The data accounts for the full process numerically, but it does not split this outer gap into those subcomponents.

Combining the outer gap with Bootstrap/runner, entry import, and AE/LUT setup yields approximately 344 ms for default and 354 ms for audio-only. This fixed isolated-worker envelope is about 83-86% of the median Python process. By contrast, measured Resolve connection plus project/timeline acquisition is about 34-37 ms, both track scans together are about 17-18 ms, mixed OTIO export plus parse is about 9 ms, and per-clip data/JSX is about 2 ms.

## Audio timeout conclusion

The earlier intermittent 10-second audio timeout did not reproduce in four audio-only runs. Every observed native call returned quickly, and all nine exports succeeded. Therefore this task cannot identify the real-host blocking call or claim the reliability defect fixed. The failure-safe last-eight-call channel remains technically qualified, but a future recurrence is still required to localize the native boundary.

The narrowest evidence-backed statement is unchanged: the prior timeout was consistent with a transient blocking `fusionscript` call, not an unbounded Python loop. Raising the Runtime timeout is not a fix.

## Ranked next experiments

1. **Restartable persistent Python worker A/B.** The measured upper bound is roughly 300-350 ms per export because fixed worker/bootstrap/import/platform/outer-envelope work dominates while successful Resolve API work is modest. The experiment must retain per-command project/timeline reacquisition, one-command serialization, a 10-second parent-owned kill, automatic worker replacement after timeout/crash/Resolve restart, and no retry of the failed command. This is now justified as a separate architectural experiment, but its actual saving must be measured because the 182-184 ms outer gap is not internally split.
2. **Replace Windows `platform.system()` in LUT directory selection.** The measured AE/LUT phase is approximately 35-44 ms and prior safe microbenchmarks attribute about 37-43 ms to this call. This is a low-risk, bounded optimization independent of worker architecture.
3. **Skip unused media-policy track scans.** Audio-only still spends a median 9.686 ms scanning video tracks that its policy does not consume. The reciprocal video-only saving was not measured because the user stopped before that matrix.
4. **Do not prioritize individual clip-property or OTIO parse changes.** Per-call buckets are sub-millisecond to low-single-digit totals for one target clip, clip-data/JSX is about 2 ms, and OTIO parse is below 2 ms. `Input LUT` removal would not materially change this timeline's latency.

## Decision

The original one-second Python/Resolve hypothesis is not reproduced on the optimized host: the current warm command is about 0.46-0.47 seconds, with about 0.41 seconds inside the isolated Python process. The dominant measured opportunity is the fixed short-lived worker envelope, not Resolve timeline IPC, OTIO, or JSX computation.

No optimization is implemented in this task. The recommended next task is a bounded, restartable persistent-worker A/B with explicit failure-isolation gates. The low-risk `platform.system()` replacement may be evaluated independently if a smaller change is preferred first.
