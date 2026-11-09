---
title: "Install and manage extensions"
description: "Clackly v0.1.6 guide: Install and manage extensions"
---

**A .clackly package executes local code.** Python runs with current-user permissions, without an OS sandbox. Source text is self-declared, not a verified signature. Install only trusted packages; confirmation is not isolation or proof of safety.

## Install

1. Obtain the author's .clackly file and explanation of its effects.
2. Open **Settings → Extensions → Install** and choose the file.
3. Review package identity, version, source and risk notice, then confirm.
4. Fill required settings, save and check enablement and readiness.
5. Find its commands in the Launcher and verify the source before running. Commands refresh without restarting.

Successful package validation does not prove Resolve or the Runtime is ready. Resolve the reported Host or dependency issue separately.

## Update and replace

The same ID and SemVer precedence means **Replace**. A higher version means **Update**; a lower version is explicitly a downgrade. Every import needs confirmation. After editing source, package and import again; never modify installed scripts or state files.

**Disable** retains files and settings while preventing execution. **Uninstall** retains settings by default, with an option to remove them. Replacement, disable, uninstall or configuration changes can close affected Views and invalidate sessions. Save active edits first.

Ordinary Resolve Scripts follow a [different discovery path](/Clackly/en/docs/launcher/). Install the Skill in your Agent and .clackly packages in Clackly.
