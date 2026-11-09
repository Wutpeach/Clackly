---
title: "Install and manage extensions"
description: "Import trusted .clackly packages, configure commands and manage versions."
---

**Install only .clackly packages you trust.** Extensions run local Python with your permissions and no sandbox. Source labels are author-declared, not verified signatures.

## Install

1. Obtain the author's .clackly file and explanation of its effects.
2. Open **Settings → Extensions → Install** and choose the file.
3. Review package identity, version, source and risk notice, then confirm.
4. Fill required settings, save and check enablement and readiness.
5. Find its commands in the Launcher and verify the source before running. Commands refresh without restarting.

If the interface reports a missing Host or dependency, resolve it before running commands.

<figure class="docs-shot">
  <a href="/Clackly/images/docs/extensions-en.webp"><img src="/Clackly/images/docs/extensions-en.webp" alt="Summary extension details with version, declared source, Disable and Uninstall buttons, prefix configuration and commands" width="1520" height="1120" loading="lazy" /></a>
  <figcaption>Isolated Electron capture of the installed official summary example with temporary settings. It is not preinstalled; its author-defined labels remain Chinese. Resolve is disconnected. Click for the original.</figcaption>
</figure>

## Update and replace

Click an entry in the extension list to inspect its version, source, configuration and commands, or to disable or uninstall it.

Reinstalling the same extension offers **Replace, Update or Downgrade** according to version. Nothing changes until you confirm. After source changes, package and import again; do not edit installed files.

**Disable** retains files and settings while preventing execution. **Uninstall** retains settings by default, with an option to remove them. Replacement, disable, uninstall or configuration changes can close affected Views and invalidate sessions. Save active edits first.

For ordinary scripts, see [Launcher and search](/Clackly/en/docs/launcher/). Install the [Developer Skill](/Clackly/en/docs/developer/skill/) in your Agent and .clackly packages in Clackly.
