---
title: "Get and install the Developer Skill"
description: "Get and install the Developer Skill · Clackly v0.1.6 Developer Skill"
---

## Recommended: get it from Clackly Settings

v0.1.6 bundles the complete **Clackly Developer Skill**.

1. Open **Settings → Extensions** and find Clackly Developer Skill.
2. Click **Copy Agent installation prompt** and paste it into your local Agent.
3. The Agent identifies its client's supported installation method, reads the real bundled directory, imports the entire folder and verifies discovery.
4. Compare any existing copy first. Replacing it requires your explicit approval. Start a new session when the client needs one.

Clackly does not edit Agent configuration. Application upgrades update only the bundled source; imported copies do not synchronize automatically. Copy the installation prompt again when an update is needed.

## Cloud or sandboxed Agents

A local path may be inaccessible. Use **Open Skill folder** to share the entire directory/ZIP, or ask the Agent to read [llms.txt](/Clackly/llms.txt) and its raw links. Reading website sources is not proof that a local Skill has been installed in the cloud.

Alternatively, extract **skills/clackly-developer/** from the [v0.1.6 source archive](https://github.com/Wutpeach/Clackly/archive/refs/tags/v0.1.6.zip), without building Clackly. Keep SKILL.md, references, examples and scripts together. This website corrects released-status wording; historical development qualifiers in the old archive do not override actual Release status.

A Cindy project Skill can live at **your-tool-workspace/.agents/skills/clackly-developer/**; start a new session afterwards. Other clients use their documented directories/import workflows. Do not assume a universal path. Without a Skill loader, explicitly ask the Agent to read the complete folder's SKILL.md.

[English README](/Clackly/agent/clackly-developer/README.md) · [Chinese README](/Clackly/agent/clackly-developer/README.zh-CN.md) · [Raw Skill](/Clackly/agent/clackly-developer/SKILL.md)
