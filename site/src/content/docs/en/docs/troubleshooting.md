---
title: "FAQ and troubleshooting"
description: "Check loading, shortcuts, runtime and extension errors by symptom."
---

## Clackly is absent from Workflow Integrations

Check the [compatibility scope](/Clackly/en/docs/#supported-context), a completed installation and a Resolve restart. If the menu is still absent, check the official Workflow Integration components; see the repair steps below if they are missing.

## Ctrl + Space shows no palette

Load **Workspace → Workflow Integrations → Clackly** first. Check whether another application owns the shortcut. If you have run a development build, exit the old Clackly process before loading the plugin to avoid duplicate instances.

## An installed extension cannot run

Check enablement, saved required settings, Resolve and its Scripting API. Keep the error and extension version. If the failed operation could have written data, inspect it before retrying.

## WorkflowIntegration.node is missing

Repair the official Resolve SamplePlugin component and rerun the installer. Do not copy the file from unknown websites or another machine, or broaden permissions across the shared directory.

## An ordinary script is missing

Search by name or use an existing Pin/Recent entry; ordinary scripts do not populate fallback Commands. Confirm its source is actually recognized by Resolve/Clackly. Extension packages and ordinary Scripts use different installation paths.

## My Agent cannot see the Skill

Cloud Agents may not access local paths. Share the complete Skill folder/ZIP or ask the Agent to read [llms.txt](/Clackly/llms.txt). Keep references, examples and the packager together with SKILL.md.

## Compatibility, removal and support

See the [documentation overview](/Clackly/en/docs/#supported-context) for compatibility and [installation](/Clackly/en/docs/install/) for validation limits. Remove extensions through Settings instead of deleting managed files.

When opening a [GitHub Issue](https://github.com/Wutpeach/Clackly/issues), include Clackly/Resolve/Windows versions, extension ID/version, steps, the exact error and whether data changed. Remove confidential project information, media paths and personal data.
