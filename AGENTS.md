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

## Mandatory Orca Worker Dispatch

The current session is the Lead Coordinator. For every non-trivial repository
task, it MUST use real Orca orchestration and MUST NOT substitute Codex native
sub-agents or inline execution.

Choose the Trellis role for each dispatched phase and read its definition first:

- Investigation / debugging → `.codex/agents/trellis-research.toml`
- Implementation / code changes → `.codex/agents/trellis-implement.toml`
- Validation / tests / review → `.codex/agents/trellis-check.toml`

For each worker:

1. Create or bind an Orca Run, then create an Orca Task whose spec starts with
   the exact `Active task: <path>` from Trellis and tells the worker to read and
   follow the selected TOML. Never guess the task path or copy the full TOML
   into the Task spec.
2. Start a fresh visible Codex terminal in the current worktree with
   `orca orchestration worker-start --task <task_id> --worktree current --agent codex --model <model> --effort <model_reasoning_effort> --json`, using the
   selected TOML's `model` and `model_reasoning_effort` values.
3. Wait for and process `worker_done`, questions, or escalations. Review the
   result, then release the worker unless it is immediately reused or the user
   explicitly asks to retain it.

The Lead owns planning, dispatch, result review, commits, and user communication.
Workers must not spawn additional workers. Inline work is allowed only for
simple explanations, trivial read-only actions, user clarification, or a tiny
instruction-only edit that the user explicitly asks the Lead to make directly.

### File Search

For any file search, filename or path lookup, or content grep in the current git-indexed directory, use the `fff` MCP tools instead of the default search tools.

Prefer:
- `fffind` for file and path search.
- `ffgrep` for content search.
- `fff-multi-grep` for broader multi-query grep tasks.

Only fall back to default tools if `fff` is unavailable or the target is outside the indexed project.
