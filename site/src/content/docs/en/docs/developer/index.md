---
title: "Build with AI: from idea to extension"
description: "Describe your Resolve task and have an Agent build an extension with the official Skill."
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

**skills/clackly-developer/** is the authority for protocols, examples and the packager. This site generates reference pages from it and preserves raw Markdown and source files byte for byte.

Cloud Agents can find all raw sources in [llms.txt](/Clackly/llms.txt). Pages also offer **Copy for Agent** and raw Markdown links. Reading website sources and installing the Skill in an Agent are separate ways to use it.

These UI capabilities ship in v0.1.6; check the installed Clackly version before starting. Extensions run **unsandboxed local Python**, without arbitrary webpages, persistent services or automatic dependency installation. See [verification and packaging](/Clackly/en/docs/developer/verify/) for write identities, timeouts and real Host testing.

[Choose an example](/Clackly/en/docs/developer/examples/) · [Verify and package](/Clackly/en/docs/developer/verify/)
