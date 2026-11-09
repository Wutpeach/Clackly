---
title: "Launcher, search and ordinary scripts"
description: "Pin frequently used commands, revisit recent actions or search by name."
---

## The default Launcher

The list groups entries into **Pinned, Recent and Commands**. Empty groups stay hidden and commands are not duplicated. Pin and Recent persist across sessions for built-ins, extensions and ordinary scripts.

Select a command and click **Pin** to pin or unpin it. Recent brings back executed commands. Commands alternates built-in and extension entries; scroll to see more. Use the arrow keys to select and Enter to run.

## Search

Type a name or keyword to see Results. English, Chinese and pinyin matching depend on the names and keywords a command provides. Relevance leads ranking; usage also affects ordering. Check the source label—**Clackly, an extension name or a script origin**—before running commands with identical names.

Press **Escape** to return to the Launcher.

<figure class="docs-shot docs-shot-palette">
  <a href="/Clackly/images/docs/search-en.webp"><img src="/Clackly/images/docs/search-en.webp" alt="Searching for 摘要 finds the summary command with its Extension source below the name" width="480" height="640" loading="lazy" /></a>
  <figcaption>Isolated Electron capture of the installed official summary example. Its author-defined names remain Chinese; Resolve is disconnected. Click for the original.</figcaption>
</figure>

## Ordinary Resolve Scripts

Access ordinary Resolve Python/Lua scripts through **search, Pinned or Recent**; they do not automatically appear in Commands. Availability depends on script location, Resolve and the local runtime. Ordinary Lua script support does not imply support for Lua extension packages.

Use [extensions](/Clackly/en/docs/extensions/) for structured configuration, inputs or Views. To create your own, start with [Build with AI](/Clackly/en/docs/developer/).
