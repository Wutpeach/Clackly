# Persistent Python B Performance Analysis

Sampled on 2026-08-30 from the installed B diagnostic Workflow in a local Resolve project with After Effects running. The user stopped after six successful serial exports because the steady improvement was already clear.

## Observations

- One labeled first/prewarm ordinary export: command total 5572.153 ms; persistent request 67.909 ms; worker `prewarmed`; Probe cache `hit`; AE `running`.
- Four steady ordinary exports: total 101.401–124.694 ms, median 112.440 ms; persistent request 46.652–64.992 ms, median 50.647 ms.
- One audio-only export: total 95.900 ms; persistent request 27.747 ms. This is directional evidence only, not an audio median.
- All six records succeeded. Every record used a Probe cache hit and observed AE running. The first 5.5-second outlier is almost entirely outside the persistent Python request and therefore is not evidence of slow persistent-Python execution; the bounded B schema cannot attribute that outer first-use delay further.

## A/B decision against the corrected A baseline

Corrected A default baseline: total median 464.559 ms; Python median approximately 415 ms.

- B steady default total median: 112.440 ms, passing the <=200 ms gate.
- Median reduction: 352.119 ms, passing the >=250 ms gate.
- B persistent-request ratio: 50.647 / 415 = 12.20%, passing the <=35% gate.

The B arm therefore passes the planned default performance gates with four steady samples after the labeled first-use observation. The sample count is below the preferred five steady default and five audio-only runs, so the conclusion is strong for the default latency gate but intentionally limited for audio distribution and rare-tail behavior.

No adoption is implied. Output inspection, controlled timeout recovery, same-version Resolve restart recovery, and mandatory clean-A restoration remain separate gates in this experiment task.
