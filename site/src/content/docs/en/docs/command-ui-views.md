---
title: "Command UI and Extension Views"
description: "Use one-run input forms and windows for continued browsing."
---

Extensions can offer a one-run input form or a window for continued browsing. Clackly renders the interface; the extension defines its fields and actions.

## A single run: Command UI

A command can show input fields and confirmation before execution. Inputs belong to that run, not persistent settings. Cancelling the form starts no execution. Submission shows progress, a brief success notification or inspectable/copyable results and errors.

Forms using **Dynamic Prepare** read choices from the current project when opened or refreshed. Check selections and confirmation again after refreshing. A required choice without available options blocks execution.

<figure class="docs-shot docs-shot-command">
  <a href="/Clackly/images/docs/command-ui-en.webp"><img src="/Clackly/images/docs/command-ui-en.webp" alt="Official summary Command UI with title, notes, number inputs, Cancel and Run command buttons" width="960" height="1160" loading="lazy" /></a>
  <figcaption>Isolated Electron capture of the official example’s static form. It neither reads nor changes Resolve projects. Author-defined fields remain Chinese; scroll for more fields and confirmation. Click for the original.</figcaption>
</figure>

## Continued browsing: Extension Views

A View is a separate tool window that can offer lists, search, filters, details and actions. Reopening the same extension returns to its existing window.

- **Ctrl + .**: open the current View's action panel.
- **Arrow keys / Enter**: select and run.
- **Escape**: close the current menu, cancel confirmation or go back one level; the root page stays open.

An extension can offer create/edit forms or enable multiselect batch actions in the same window. Leaving an unsaved form prompts for confirmation; drafts do not survive a closed session. Batch results can show successes, failures and reasons separately.

Some extensions refresh lists or details when the window regains focus; forms do not refresh this way. Read data again after switching projects or deleting objects.

## Check data before retrying

Closing a window or reaching a timeout does not cancel code or undo completed writes. Check targets before retrying. The Host provides no transactions, automatic rollback or Undo.

Build these tools with [Agent prompts](/Clackly/en/docs/developer/prompts/) and the [official Views contract](/Clackly/en/docs/developer/reference/views/).
