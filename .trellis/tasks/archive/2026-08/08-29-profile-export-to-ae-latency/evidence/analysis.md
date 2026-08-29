# Export to AE Real-Host Latency Analysis

## Evidence Set

- Captured on 2026-08-29 from the packaged diagnostic Workflow Integration in a local Resolve project with After Effects already running.
- Raw evidence: `export-to-ae-profile-raw.jsonl`.
- Raw SHA-256: `D767A92EAD0ECC069802B417A80B94C5D47BBC4F22413C4362F5749A16403FF6`.
- Nine valid JSONL records, zero malformed records: five successful default mixed exports, two successful audio-only exports, and two audio-only failures.
- Video-only sampling was not continued after repeated audio-only failure. The user judged the collected evidence sufficient and asked not to force the remaining matrix.

## Successful Steady-State Results

All successful records used a passed Probe cache hit, reported AE state `running`, and targeted one clip.

| Command | Samples | Command total median (range) | Python process median (range) | AE detection median (range) | AE spawn ack median (range) |
|---|---:|---:|---:|---:|---:|
| Default mixed | 5 | 1471.7 ms (1444.0–1570.4) | 1033.4 ms (975.9–1093.7) | 424.9 ms (394.3–458.7) | 27.9 ms (24.0–28.2) |
| Audio-only | 2 | 1684.3 ms (1600.4–1768.2) | 1190.8 ms (1152.0–1229.5) | 448.9 ms (404.6–493.2) | 23.8 ms (23.2–24.3) |

For the five default samples, the median Python process accounts for about 70.2% of command time and AE running-state detection accounts for about 28.9%. Host version, Runtime resolution, Probe cache hit validation, AE validation/temp write, spawn acknowledgement, and unattributed host overhead together are small compared with those two contributors.

The Probe cache is not the cause: every record is a cache hit and median Probe readiness is 4.4 ms for default and 4.1 ms for audio-only.

## Repeated Audio Failure

The third and fourth recorded audio-only attempts failed before any AE phase:

| Attempt | Command total | Python process | AE state |
|---|---:|---:|---|
| Audio failure 1 | 10999.2 ms | 10954.1 ms | unknown |
| Audio failure 2 | 11057.6 ms | 11025.0 ms | unknown |

`RuntimeLauncher` has a fixed 10,000 ms timeout. Both failures spend effectively the entire command in the isolated Python process and never enter AfterEffectsLauncher. This is consistent with a Python/Resolve call hanging until the Runtime timeout, not with AE process detection or AE cold start. Because the private Python profile is returned only on success, this evidence cannot identify the exact Resolve call that hung.

## Profiling Limitation Found

The Python profiling helper transported `time.perf_counter()` deltas in seconds while Node interpreted them as milliseconds. Sub-millisecond-to-few-millisecond Python phase values therefore rounded to `0.0` in JSONL. Top-level Node measurements remain valid, including command total, Runtime child-process duration, Probe/cache, AE detection, and spawn acknowledgement. The defect prevents a reliable breakdown of the approximately one-second Python process into Resolve acquisition, selection scan, OTIO, and JSX phases.

## Bottleneck Ranking

1. **Isolated Python/Resolve business process:** approximately 0.98–1.09 seconds for default and 1.15–1.23 seconds for successful audio-only. It is the largest contributor and also owns the repeated 10-second audio failure boundary.
2. **PowerShell AE running-state detection:** approximately 0.39–0.49 seconds on every successful warm export. It is a fixed shared cost and independently matches the earlier safe local baseline of 0.34–0.52 seconds.
3. **Everything else in the Node host:** tens of milliseconds combined. Optimizing config checks, Runtime resolution, or Probe cache reads would not materially change the user-visible delay.

## Recommended Next Experiments

### First: remove the confirmed low-risk fixed cost

Open a separate optimization task to replace per-export PowerShell cold start with a bounded native/Node process-state mechanism or another fresh-state mechanism that preserves exact executable-path validation and the existing fail-closed behavior. The measured maximum upside is roughly 0.4–0.5 seconds per warm export, reducing the default median from about 1.47 seconds toward about 1.05 seconds if no new overhead is introduced.

Do not cache AE state for an unbounded interval: a stale `running` result would weaken current launch correctness. Any replacement must keep the configured-executable identity check and unknown-state failure behavior.

### Second: isolate the larger Python cost and audio hang

Use a corrected millisecond conversion and failure-safe phase events around coarse Resolve boundaries, with special attention to lazy Resolve/project acquisition and the audio-only per-item API calls. The next diagnostic must retain timing on failure instead of returning it only in the success envelope. This should be a focused investigation before considering a persistent Python worker, because the current evidence cannot distinguish interpreter/import overhead from Resolve API latency.

The repeated audio timeout should be tracked as a real reliability defect, separate from normal latency optimization. Increasing the 10-second timeout would hide the symptom and is not a fix.

## Decision

The original performance concern is confirmed. There is clear optimization headroom, but the evidence supports two separate changes rather than one broad rewrite: remove the approximately 0.4-second fixed AE probe cost, then diagnose the approximately one-second Python/Resolve cost and repeated audio hang with corrected failure-safe profiling.

## Cleanup and Restore Verification

- All temporary profiling source, tests, private carriers, and timing hooks were removed. Product source is identical to the pre-task `HEAD`; only this task's documents and bounded evidence remain in the final diff.
- The post-removal qualification passed: 352 Node tests and Python suites of 6, 26, 15, 32, and 2 tests, plus Python compilation, Node syntax checks, and diff checks.
- The clean managed Runtime was restaged, the Windows directory package was rebuilt, and `package:verify` confirmed the packaged CPython 3.13.14 x64 Runtime.
- `scripts/resolve2ae_export.py` SHA-256 is `ADADF30C58F6C9494FE284DAB7972CEDD2AA50F30EE35028F735E6FC8ECC817F` in source, Runtime staging, packaged app, packaged Runtime, and the installed Workflow.
- `resolve2ae_core/export.py` SHA-256 is `083177F0783588DFEB5C47E8CAC5B973328781701E70A158A445044CE8488116` in the same five locations.
- The packaged and installed Workflow contain no profiling markers or temporary profiling modules. The clean package was installed only after confirming Resolve and After Effects were not running.
- The live `%APPDATA%\Clackly\export-to-ae-profile.jsonl` matched the retained evidence hash exactly and was moved to the Recycle Bin; the evidence copy above remains the sole active diagnostic record.
