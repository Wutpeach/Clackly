---
title: "FAQ and troubleshooting"
description: "Clackly v0.1.6 guide: FAQ and troubleshooting"
---

## Clackly is absent from Workflow Integrations

Confirm Windows x64 Resolve Studio, a successful installation and a Resolve restart after installation. Check the official Workflow Integration components. Menu registration and a command failing inside an open palette are separate paths; identify which one failed.

## Ctrl + Space shows no palette

Load **Workspace → Workflow Integrations → Clackly** first. Close old Clackly development processes and check whether another application owns the shortcut. Avoid starting duplicate Hosts or changing production projects to investigate.

## An installed extension cannot run

Check enablement, saved required settings, a running Resolve and its Scripting API. Runtime compatibility and package integrity are independent checks. Installation does not guarantee execution. Keep the error and extension version. After any failed write, inspect actual data before retrying.

## WorkflowIntegration.node is missing

Repair the official Resolve SamplePlugin component and rerun the installer. Clackly excludes that native file from distribution. Do not copy it from unknown websites or another machine, or broaden permissions across the shared directory.

## An ordinary script is missing

Search by name or use an existing Pin/Recent entry; ordinary scripts do not populate fallback Commands. Confirm its source is actually recognized by Resolve/Clackly. Extension packages and ordinary Scripts use different installation paths.

## My Agent cannot see the Skill

Cloud Agents may not access local paths. Share the complete Skill folder/ZIP or ask the Agent to read [llms.txt](/Clackly/llms.txt). Keep references, examples and the packager together with SKILL.md.

## Compatibility, removal and support

The public target is Windows + Resolve Studio. macOS, Linux, the free edition and arbitrary version compatibility are not promised. Full uninstall has not had dedicated acceptance. Remove extensions through Settings instead of deleting managed files.

When opening a [GitHub Issue](https://github.com/Wutpeach/Clackly/issues), include Clackly/Resolve/Windows versions, extension ID/version, steps, the exact error and whether data changed. Remove confidential project information, media paths and personal data.
