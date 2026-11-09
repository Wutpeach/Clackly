---
title: "Start from complete official examples"
description: "Choose a complete example for your tool and develop with your own extension ID."
---

Examples and the packager come from the Developer Skill; this site exports their source instead of maintaining another copy. Start in your own clean source folder and choose a unique Extension ID. Do not reuse an example ID for an unrelated tool.

| Example | Purpose | Complete source |
| --- | --- | --- |
| Project Inspector | Read-only inspection, including no-project handling | [Manifest](/Clackly/agent/clackly-developer/examples/inspect-project/manifest.json) / [Python](/Clackly/agent/clackly-developer/examples/inspect-project/inspect.py) |
| Run Summary | Static inputs, confirmation, structured results | [Manifest](/Clackly/agent/clackly-developer/examples/run-summary/manifest.json) / [Python](/Clackly/agent/clackly-developer/examples/run-summary/summary.py) |
| Timeline Summary | Dynamic Prepare options and defaults | [Manifest](/Clackly/agent/clackly-developer/examples/timeline-summary/manifest.json) / [Python](/Clackly/agent/clackly-developer/examples/timeline-summary/report.py) |
| Marker Browser | Read-only List/Detail, search and actions | [Manifest](/Clackly/agent/clackly-developer/examples/marker-browser/manifest.json) / [Python](/Clackly/agent/clackly-developer/examples/marker-browser/markers.py) |
| Timeline Manager | Create/Edit, batch and refocus refresh | [README](/Clackly/agent/clackly-developer/examples/timeline-manager/README.md) / [Manifest](/Clackly/agent/clackly-developer/examples/timeline-manager/manifest.json) / [Python](/Clackly/agent/clackly-developer/examples/timeline-manager/timelines.py) |

Marker Browser combines project/timeline IDs, frame and content fingerprint. It cannot distinguish identical deletion/recreation at the same frame: **never use that identity for writes**. Timeline Manager uses native stable project/timeline IDs and name snapshots, revalidating before writes. Leave live testing to the user in an explicitly disposable local project, away from network libraries and production data.

The [contract](/Clackly/en/docs/developer/reference/extension-v1/) defines context, ten-second execution bounds, the managed Runtime and immutable packages. Verify Resolve methods against the user's Blackmagic Scripting API docs. The Skill is not a complete Resolve API manual.
