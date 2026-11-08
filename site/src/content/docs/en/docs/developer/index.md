---
title: "Build with AI: from idea to extension"
description: "Build with AI: from idea to extension · Clackly v0.1.6 Developer Skill"
---

You do not need to learn Clackly's internals first. Describe the Resolve task. Your Agent uses the **official Developer Skill** to read the protocol, choose an example, write Python and deliver an installable .clackly plus editable source.

## A practical delivery path

1. [Install the Developer Skill](/Clackly/en/docs/developer/skill/) in your Agent. It is separate from an extension installed in Clackly.
2. [Copy a task prompt](/Clackly/en/docs/developer/prompts/), adding your business goal, read/write scope and installed Host version.
3. The Agent checks Host support, reads relevant contracts and complete examples, verifies offline and runs the official packager.
4. Review the source and results, import through Settings, then verify actual Resolve behavior in an explicitly authorized local test project.

## Choose the smallest suitable form

| Need | Form | Official reference |
| --- | --- | --- |
| A single read/action | Python Command | [Manifest and lifecycle](/Clackly/en/docs/developer/reference/extension-v1/) |
| One-run inputs, confirmation, results | Command UI | [Command UI](/Clackly/en/docs/developer/reference/command-ui/) |
| Choices from the current project | Dynamic Prepare | [Prepare](/Clackly/en/docs/developer/reference/prepare/) |
| Continued browsing, details, actions | Extension View | [Views](/Clackly/en/docs/developer/reference/views/) |
| Create/Edit and multiselect batch | View Form / Batch | The same Views contract and Timeline Manager |

## One protocol authority

Protocols, examples and the packager live in **skills/clackly-developer/**. The website generates reference pages from that directory at build time. Raw files are copied byte for byte and checked with SHA-256. Do not edit generated pages to create another protocol.

Cloud Agents can discover the full raw material through [llms.txt](/Clackly/llms.txt). Web pages offer **Copy for Agent** and raw Markdown links. An Agent without local filesystem access must not claim to have installed your local Skill.

v0.1.6 ships Command UI, Prepare, Views, Forms and Batch. Still check the installed target Host. Extensions are **unsandboxed local Python**, not arbitrary Web UI, persistent services or dependency installers. Revalidate stable identities before writes. Offline checks do not establish real Resolve compatibility.

[Choose an example](/Clackly/en/docs/developer/examples/) · [Verify and package](/Clackly/en/docs/developer/verify/)
