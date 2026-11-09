---
title: "Verify, package and iterate"
description: "Check offline, package and verify in a local test project."
---

## Offline checks

Use Python 3 syntax checks and small fixtures for deterministic logic. Cover useful results, missing project/timeline, stale objects and failures. Business code uses context.resolve for the supplied official connection, never Clackly internals or Host calls at module import.

Both context.project and context.timeline **require an open project and current timeline**. For project-only tools, query Resolve's ProjectManager and handle a missing project. See [lifecycle](/Clackly/en/docs/developer/reference/extension-v1/).

## The official packager

With the complete Skill available, replace these paths and run:

~~~text
python clackly-developer/scripts/package_extension.py my-tool output/my-tool-1.0.0.clackly
~~~

On Windows use a confirmed Python 3 or py -3; elsewhere use python3. Output must be outside the source folder and must not already exist. The tool checks basic identity, exact entry paths, Python syntax and execute/view callbacks before creating the ZIP. **It does not import or execute extension code or replace Host installer validation.**

[Raw package_extension.py](/Clackly/agent/clackly-developer/scripts/package_extension.py)

## Real Host verification

Deliver editable source, the package, actual check results and remaining live test steps. The user installs through Settings in an isolated local test project, checking configuration, inputs, confirmation, results, stale targets and post-failure data. Do not operate production projects or the current Clackly installation merely to complete a test.

## Iterate

Preserve Extension ID, Command IDs and compatible setting keys/types for the same tool. Repackage with an increased version, or use a same-version Replace. Never edit the installed tree. Explain incompatible configuration changes. A timeout can follow a completed write; inspect before retrying. Do not promise transactions or automatic rollback.
