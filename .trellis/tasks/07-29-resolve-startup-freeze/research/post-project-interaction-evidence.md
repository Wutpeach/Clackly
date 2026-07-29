# Post-project Interaction Evidence

New user evidence changes the reproduction boundary:

- The freeze occurs only after a project opens; Project Manager-only startup is non-diagnostic.
- Any project appears sufficient, so exact project identity is not treated as causal.
- Dragging the timeline playhead/time indicator stutters during the affected period.

Controlled runs therefore start at the Resolve log's `Current project pointer changed to (...)` event and include a 30-second playhead-drag interval. Evidence collection covers Resolve GUI `Responding`, CPU/memory, GPU engine utilization, and Resolve-bundled Workflow Electron/Chromium child processes.
