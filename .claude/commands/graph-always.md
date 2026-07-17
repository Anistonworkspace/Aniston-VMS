---
name: graph-always
description: Toggle "Graphify-first" mode on/off. When ON, Claude queries the codebase graph BEFORE editing on any code-change prompt. When OFF (default), the graph is used only when a change ripples. One-change toggle.
---

# /graph-always — toggle Graphify-first mode

Controls whether Claude **always checks the graph before editing**. The toggle is one word in
`.claude/graph-mode` (gitignored, per-machine, default `off`).

## Usage

- **`/graph-always on`** — turn it ON
- **`/graph-always off`** — turn it OFF (back to normal)
- **`/graph-always status`** — report the current mode

## What to do when invoked

Parse the argument after `/graph-always`:

- `on`:
  ```bash
  echo on > .claude/graph-mode
  ```
  Then say: "Graphify-first mode ON — I'll query the graph (`/graph inbound`) before editing on
  code-change prompts. Turn off with `/graph-always off`."

- `off`:
  ```bash
  echo off > .claude/graph-mode
  ```
  Then say: "Graphify-first mode OFF — back to normal (graph used only when a change ripples)."

- `status` (or no argument):
  ```bash
  cat .claude/graph-mode 2>/dev/null || echo off
  ```
  Report ON or OFF.

## How it behaves

- **ON:** the `on-prompt.sh` hook injects a "check the graph first" directive on prompts that look
  like code changes (build/edit/refactor/add/fix/rename/…). Pure questions and chat are unaffected.
- **OFF:** nothing injected — Claude queries the graph only when it judges the change has ripple
  effects (a shared type, a hub file) or when you ask an architecture question.

You can also toggle without this command: edit the single word in `.claude/graph-mode`, or run
`echo on > .claude/graph-mode` / `echo off > .claude/graph-mode`.
