<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

## Orca Worker Collaboration

Collaboration is primarily based on Orca Workers.

On new session start, launch Orca collaboration and ensure a base Develop Worker exists: role=developer, label=develop, agent=Codex, model=gpt-5.6-terra, effort=xhigh, worker_permission_mode=bypassPermissions.

The Lead window is responsible for understanding requirements, planning, task decomposition, coordination, acceptance, and result summary.

- Dispatch coding implementation tasks to the `develop` Worker by default.
- For independent research into code, conventions, or impact scope, create a `research` Worker (role=researcher, label=research, agent=Pi, model=deepseek-v4-flash-vision-exp, effort=MAX, worker_permission_mode=bypassPermissions).
- When multiple tasks can progress independently, additional Workers may be created: each Worker handles exactly one clearly bounded task with a unique label, and no more than 3 active simultaneously; cross-Worker shared conventions are specified by the Lead when dispatching.
- Workers must not recursively dispatch other Workers; the Lead checks actual changes and verification results before summarizing to the user.
- If Orca collaboration cannot start, report the situation honestly and ask the user how to proceed.
