# Project Memory System

A persistent, file-based memory layer designed for multi-agent AI development (Claude Code, Codex, future agentic tools). Every agent reads from and writes to this directory so that:

- **Fresh chats keep full context** — open a new conversation, point an agent at `memory/INDEX.md`, and it picks up where you left off.
- **Parallel agents coordinate** — `coordination/` tracks who is editing what so two agents don't trample each other.
- **Plans persist before execution** — every non-trivial change is written to `plans/_active/` *before* code is touched, so any interruption is recoverable.
- **All prompts and changes are logged** — daily files in `prompts/` and `changes/` form a complete audit trail.
- **Architecture decisions are recorded** — `decisions/` holds ADRs (architectural decision records) that explain *why*, not just *what*.

## Directory layout

```
memory/
├── README.md              ← you are here
├── INDEX.md               ← master index every agent reads first
├── project-state.md       ← live snapshot: what's built, what's pending, last known-good state
├── conventions.md         ← codified project conventions (extracted from .claude/rules/)
├── glossary.md            ← project-specific terminology
├── plans/
│   ├── _template.md       ← copy this to create a new plan
│   ├── _active/           ← plans currently being executed
│   └── _archive/          ← completed plans (move from _active)
├── prompts/               ← daily prompt log (YYYY-MM-DD-prompts.md)
├── changes/               ← daily change log (YYYY-MM-DD-changes.md)
├── agents/                ← per-agent accumulated context
│   ├── _template.md
│   └── <agent-name>.md
├── coordination/
│   ├── locks.md           ← which agent is editing which files
│   ├── shared-context.md  ← cross-agent shared state
│   └── handoffs.md        ← when one agent passes work to another
└── decisions/
    └── NNNN-<slug>.md     ← ADRs, numbered sequentially
```

## Read order for any agent starting work

1. `memory/INDEX.md` — orientation
2. `memory/project-state.md` — current state
3. `memory/coordination/locks.md` — what's currently locked
4. `memory/coordination/shared-context.md` — what other agents have learned
5. Relevant ADRs in `memory/decisions/`
6. Then proceed with the user's task

## Write rules

- **Before any non-trivial change** → write a plan to `plans/_active/`. Move to `_archive/` when complete.
- **After completing a task** → update `project-state.md` and append to today's `changes/YYYY-MM-DD-changes.md`.
- **When learning project-specific facts** → update `conventions.md` or `glossary.md` or write an ADR.
- **When taking exclusive control of files** → register in `coordination/locks.md` (with timestamp + agent name). Release when done.
- **When handing off to another agent** → write a handoff entry in `coordination/handoffs.md`.

## What NOT to write here

- Secrets, tokens, credentials, API keys (use `.env` and GitHub secrets)
- Personally identifying data
- Anything derivable from `git log` — git is the canonical source for who-changed-what

## How `memory/` differs from `.claude/memory/`

- `memory/` (this directory) is **project-scoped** — committed to the repo, shared across the team, version-controlled.
- `.claude/memory/` (Claude Code user-scoped) is **per-machine** — agent's personal notes about the user/project, not shared.

Both are useful. This system is project-scoped so it survives across machines and across different AI tools (Claude Code, Codex, etc.).
