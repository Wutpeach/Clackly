# Helper-Only Performance Qualification

Captured on 2026-08-29 from `WindowsAfterEffectsProcessProbe` only. This run
started the hidden PowerShell helper, performed one labeled warm-up query, then
six fresh steady process-table queries. It did not launch or operate Resolve or
After Effects.

| Measurement | Result |
| --- | ---: |
| Helper startup to READY | 204.7808 ms |
| First query (labeled warm-up) | 108.5971 ms |
| Steady queries | 5.5385, 5.2981, 5.0780, 4.8039, 4.9891, 4.5583 ms |
| Steady median | 5.0336 ms |
| Acceptance target | <= 50 ms |

All six steady queries reported a process count of zero. Each query was sent
through the one live helper using a distinct protocol request id; no query
result was cached. The measured steady median passes the helper-only gate.

## Prewarm-Query Refinement (2026-08-29)

Real-host feedback reported that the first ordinary Export-to-AE felt slower
than the second and third. The helper now completes one separate background
enumeration and discards its result before any user command can consume it.

| Measurement | Result |
| --- | ---: |
| Helper startup to READY | 201.1787 ms |
| Discarded prewarm query | 107.3474 ms |
| First user query (distinct next request) | 6.1131 ms |
| Steady queries | 5.3441, 5.5701, 5.2652, 5.1997, 5.1105, 5.4029 ms |
| Steady median | 5.3047 ms |
| Acceptance target | <= 50 ms |

This helper-only run did not launch or operate Resolve or After Effects. All
queries reported zero current AfterFX processes. The discarded query and each
user/steady query used separate request ids, so the prewarm result is not an AE
state cache.

## Initial Candidate Lead Requalification

The Lead independently repeated the real helper lifecycle check before packaging:

| Measurement | Result |
| --- | ---: |
| Helper startup to READY | 201.2311 ms |
| First query (labeled warm-up) | 98.7024 ms |
| Steady queries | 5.5486, 5.2320, 5.2651, 5.0996, 4.8760, 4.8009 ms |
| Steady median | 5.1658 ms |
| Helper alive after `dispose()` | false |

The Lead focused suite passed 48/48, and the full suite passed 363 Node tests
plus Python suites 6 + 26 + 15 + 32 + 2. Runtime staging, Windows directory
packaging, and `package:verify` passed. The helper SHA-256 was
`EBD28A6B67BB9D7F7EBEACD23170DCD255A2BAB72FE1C88EB7722FED53EACAF1`
in source, packaged app, and installed Workflow. Export-to-AE Python source,
staging, packaged app, and packaged Runtime hashes remained identical to the
pre-task baseline. The candidate was installed only after confirming Resolve
and After Effects were not running.

## Final Prewarm Candidate Qualification and Install

After the first real-host acceptance reported a slower-feeling first export,
the developer qualification measured startup to READY at 195.5397 ms, the
discarded prewarm query at 111.5136 ms, the first distinct user query at
6.1319 ms, and six later queries at 5.4814, 5.7125, 5.0410, 5.1041, 5.3783,
and 5.5021 ms (median 5.4299 ms). The full final suite passed 365 Node tests
plus Python suites 6 + 26 + 15 + 32 + 2; the Lead focused recheck passed
43/43.

The final helper SHA-256 is
`E72BCF35B250ACE06D80EEF2E81291013F44849EC4165050EF1AE5C172FB5759`
in source, packaged app, and installed Workflow. Runtime staging, Windows
packaging, and package verification passed again. The refined package was
installed only after confirming Resolve and After Effects were not running.
