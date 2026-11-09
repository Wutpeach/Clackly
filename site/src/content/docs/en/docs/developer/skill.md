---
title: "Get and install the Developer Skill"
description: "Get the complete Skill from Clackly and install it in your Agent."
---

## Recommended: get it from Clackly Settings

v0.1.6 bundles the complete **Clackly Developer Skill**.

1. Open **Settings → Extensions** and find Clackly Developer Skill.
2. Click **Copy Agent installation prompt** and paste it into your local Agent.
3. The Agent identifies its client's supported installation method, reads the real bundled directory, imports the entire folder and verifies discovery.
4. Compare any existing copy first. Replacing it requires your explicit approval. Start a new session when the client needs one.

Application upgrades update the bundled source; reimport the Agent copy using these steps. Clackly does not edit Agent configuration.

<figure class="docs-shot">
  <a href="/Clackly/images/docs/developer-skill-en.webp"><img src="/Clackly/images/docs/developer-skill-en.webp" alt="Developer Skill section in Settings with Copy Agent installation prompt and Open Skill folder" width="1064" height="322" loading="lazy" /></a>
  <figcaption>The actual Skill controls in Settings → Extensions, captured in isolated Electron and cropped to the relevant section. Click for the original.</figcaption>
</figure>

## Cloud or sandboxed Agents

If the local path is inaccessible, use **Open Skill folder** to share the complete directory/ZIP, or have the Agent read raw sources from [llms.txt](/Clackly/llms.txt). The website can be read directly without assuming a local copy is installed in the cloud.

Alternatively, extract **skills/clackly-developer/** from the [v0.1.6 source archive](https://github.com/Wutpeach/Clackly/archive/refs/tags/v0.1.6.zip) without building the app. Keep SKILL.md, references, examples and scripts together. Check historical development qualifiers against the [release record](/Clackly/en/docs/releases/).

A Cindy project Skill can live at **your-tool-workspace/.agents/skills/clackly-developer/**; start a new session afterwards. Other clients use their documented directories/import workflows. Do not assume a universal path. Without a Skill loader, explicitly ask the Agent to read the complete folder's SKILL.md.

[English README](/Clackly/agent/clackly-developer/README.md) · [Chinese README](/Clackly/agent/clackly-developer/README.zh-CN.md) · [Raw Skill](/Clackly/agent/clackly-developer/SKILL.md)
