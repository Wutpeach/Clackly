# Persistent Child Supervision Reuse Research

## Authorities

- Current `WindowsAfterEffectsProcessProbe` and its backend specification.
- Current one-shot Runtime launcher/environment/error contracts.
- Archived persistent-Python A/B design, package, performance, recovery, and clean-restoration evidence.
- Project code-reuse guide.

The archived B product source was intentionally removed after the experiment and was never committed. Permanent adoption must recreate the candidate from its retained design and executable evidence rather than recover a hidden source diff.

## What is genuinely shared

The two children have the same high-level recipe: versioned READY gate, positive monotonic request ids, one active request plus bounded FIFO, parent timer, kill-on-failure, no retry, later-command replacement, strict output bounds, and idempotent disposal.

Only a small subset is identical enough to share safely:

- pure native-Python crash classification already owned by the Runtime launcher;
- strict bounded UTF-8 line splitting/CRLF stripping, if extraction remains stateless;
- existing Runtime environment construction, `RuntimeError`, and request serialization for the Python consumer.

## What must remain separate

- PowerShell uses a fixed encoded `QUERY <id>` protocol and returns process records; Python uses JSON-line script requests and Runtime/script envelopes.
- PowerShell prewarm performs and discards a real process enumeration; Python preparation imports dependencies and platform identity without touching Resolve or executing the feature.
- PowerShell inherits host environment and owns no temp directory; Python uses the isolated Runtime environment and a worker-lifetime temp directory.
- PowerShell has 5-second probe-domain errors; Python has the 10-second Runtime error family, native-crash mapping, health identity, and process evidence.
- PowerShell is host-owned AE detection; Python is Runtime-owned business execution. Neither child may own, start, or speak the other's protocol.

## Decision recommendation

Keep two modules and two OS processes. Reuse only narrow pure helpers where byte-for-byte behavior is required, especially Runtime native-crash classification. Do not extract a shared stateful child supervisor with only these two divergent consumers.

A shared kernel would save an estimated 100–150 source lines but would require adapter flags for prewarm, health replacement, temp cleanup, crash classification, framing, and error mapping. It would re-open the already qualified PowerShell boundary without visible user benefit, couple two different specification owners, and still require full domain-specific tests. A broader generic supervisor is therefore rejected for this adoption scope.

## Permanent adoption implications

- Recreate the persistent Python launcher/Bootstrap at the single `RuntimeManager` Export-to-AE business seam. Runtime Probe and unrelated scripts remain one-shot.
- Preserve background no-Resolve preparation, bounded FIFO, health key, per-command Resolve/project/timeline reacquisition, 10-second no-retry failure isolation, close-before-settle, and later replacement.
- Export only narrow pure Runtime helpers if it prevents crash-classification drift. Do not refactor the PowerShell probe state machine.
- Stage and verify the persistent Bootstrap in the managed Runtime inventory.
- Update backend specs because persistent Export-to-AE becomes product authority; keep the one-shot rule scoped to `RuntimeLauncher` and Probe.
- Requalify first-use latency. The archived first command was 5572.153 ms total but only 67.909 ms in persistent Python, so its outer delay cannot be attributed to the worker and needs a labeled installed-host check.
- Workflow normal Resolve quit also closes the owning Electron host and worker. Retain Resolve-error retirement for crash/degraded-session defense, but do not claim normal quit/reopen preserves stale fusionscript state.
- Automated six-policy parity passed in the experiment, while visual AE composition inspection remains deferred and must close before final permanent acceptance.

## Rollback seam

Default `RuntimeManager` business execution back to the one-shot launcher, delete the persistent launcher/Bootstrap and lifecycle wiring, restore staging inventory, and rerun package/host checks. Resolve2AE feature sources must remain unchanged and hash-qualified.
