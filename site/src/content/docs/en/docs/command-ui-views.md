---
title: "Command UI and Extension Views"
description: "Clackly v0.1.6 guide: Command UI and Extension Views"
---

v0.1.6 publicly ships the capabilities below. The Clackly Host renders these interfaces from extension declarations and data; they are not arbitrary webpages or custom frontend code.

## A single run: Command UI

A command can show input fields and confirmation before execution. Inputs belong to that run, not persistent settings. Cancelling the form starts no execution. Submission shows progress, a brief success notification or inspectable/copyable results and errors.

**Dynamic Prepare** reads live options or defaults when the form opens or refreshes. Refresh can clear expired selections and reset confirmation. A required choice with no candidates blocks execution. Prepare cannot create fields dynamically and is not a persistent background connection.

## Continued browsing: Extension Views

A View is a separate ordinary tool window with lists, search, tag filtering, details and actions. Each extension has at most one window per Host; reopening focuses the existing session. **Ctrl + .** opens its ActionPanel. Arrow keys and Enter navigate; Escape closes the menu, confirmation or one page level, keeping the root open.

Create/Edit Forms stay in the same window. Unsaved changes prompt to keep editing or discard; drafts last only for the session. Multiselect is opt-in. Batch results can show successes, failures and a reason for every failed target.

Refocus refresh is opt-in; Forms never refresh on focus. Lists and details are snapshots. Requery after a project switch or removed object instead of trusting stale selection.

## Check data before retrying

Closing a window or reaching a timeout does not cancel code or undo completed writes. Check targets before retrying. The Host provides no transactions, automatic rollback or Undo.

Build these tools with [Agent prompts](/Clackly/en/docs/developer/prompts/) and the [official Views contract](/Clackly/en/docs/developer/reference/views/).
