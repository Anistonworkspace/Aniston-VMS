# ADR 0003 — Project-Scoped Memory System for Multi-Agent AI Development

**Status:** Accepted
**Date:** 2026-05-17
**Supersedes:** —

## Context

This boilerplate is meant to be developed primarily with agentic AI tools (Claude Code, Codex, and successors). In a typical workflow:

1. A user starts a fresh chat in their AI tool.
2. The agent has no memory of prior work.
3. The user re-explains the project, current state, conventions, and pending tasks.
4. The agent does some work, then the conversation ends.
5. Knowledge accumulated during the session is lost.

This pattern wastes hours and leads to inconsistent decisions. Worse, when multiple agents work in parallel (e.g. one writing code while another reviews), they can clobber each other or duplicate work, producing wiring gaps where Agent A's mutation isn't reflected in Agent B's frontend.

## Decision

Adopt a **project-scoped, file-based memory system** at `memory/` in the repository root.

### Properties

1. **Version-controlled** — committed to git, shared with the team. Survives across machines, AI tools, and team members.
2. **Tool-agnostic** — readable by any agent that can read files (Claude Code, Codex, future tools). Not specific to one vendor.
3. **Layered** —
   - `memory/INDEX.md` is the entry point every agent reads first.
   - `memory/project-state.md` is a live snapshot of what's built and what's pending.
   - `memory/plans/_active/` holds plans before execution (durable, recoverable).
   - `memory/coordination/locks.md` prevents parallel-agent conflicts.
   - `memory/decisions/` (ADRs) records *why* choices were made.
   - `memory/changes/` and `memory/prompts/` form an audit trail.
4. **Read-on-start, write-on-finish** — agents read context before acting and write outcomes after. Codified in `.claude/rules/memory-system.md`.
5. **Distinct from Claude Code's `.claude/memory/`** — that one is per-user, per-machine. This one is shared.

### Why files (not a database)

- Git-trackable diffs make changes auditable
- No infrastructure to run; works in any clone of the repo
- Plain markdown is readable by humans AND every AI tool
- Conflicts resolve via standard git merge

### Why this matters more than typical "project docs"

Conventional docs (README, CONTRIBUTING) are written for humans and tend to drift stale. The memory system is **written by agents for agents** as they work — keeping it current is part of the workflow, not a separate documentation chore. Stale entries are explicitly OK *as long as they're marked* (e.g. `_archive/` for old plans), because the audit trail is part of the value.

## Consequences

**Positive**

- Fresh chats hit the ground running — read `INDEX.md` → `project-state.md` → relevant ADRs → start work.
- Parallel agents coordinate via `locks.md` and `handoffs.md`, eliminating most wiring-gap classes.
- Plans persist before code is touched — interruptions are recoverable.
- Compatible with both Claude Code (which reads `.claude/rules/` + `CLAUDE.md`) and Codex (which reads `AGENTS.md`).

**Negative**

- Extra writing discipline required — agents must update state after work
- Easy to skip if not enforced; rules in `.claude/rules/memory-system.md` codify the expectation
- Risk of stale entries drifting from reality — mitigated by the "read-on-start" rule (next agent will notice and correct)

**Trade-offs**

- We accept some duplication between `memory/conventions.md` and `.claude/rules/` — the rules are authoritative, conventions.md is the digest. They diverge only if the rules change without the digest being updated; the start-of-work checklist catches this.
- We accept that this system is only as good as the agents using it — if agents skip reads/writes, value drops. The `.claude/agents/memory-coordinator.md` agent exists to police compliance.
