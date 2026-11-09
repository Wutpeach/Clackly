---
title: "Launcher, search and ordinary scripts"
description: "Clackly v0.1.6 guide: Launcher, search and ordinary scripts"
---

## The default Launcher

v0.1.6 groups commands into **Pinned, Recent and Commands**, showing only nonempty groups. Pinned commands stay close; Recent brings back executed commands. Entries are deduplicated. Pin and Recent persist across sessions for built-ins, extensions and ordinary scripts.

Use the Pin control for the selected command; pinning keeps the selection. Built-in and extension commands alternate in Commands. There is no global nine-command cutoff; the list scrolls within the same compact window. Arrow keys follow the visible order and scroll the selection into view.

## Search

Type a name or keyword to see Results. Relevance leads search ranking, with usage influencing applicable ordering. English, Chinese and pinyin matching depend on registered metadata. Source labels distinguish **Clackly, the extension name and script origins**, including commands with identical names.

**Escape** returns to the Launcher. Removing an extension refreshes its commands and repairs invalid selection.

## Ordinary Resolve Scripts

Ordinary Resolve Python/Lua scripts and **.clackly packages** are different features. Ordinary scripts are found through Pin, Recent or search; they do not automatically populate the fallback Commands group. Availability depends on local script sources, Resolve and the execution environment. Lua script discovery does not imply a Lua extension Runtime.

Use [extensions](/Clackly/en/docs/extensions/) for structured configuration, inputs or Views. To create your own, start with [Build with AI](/Clackly/en/docs/developer/).
