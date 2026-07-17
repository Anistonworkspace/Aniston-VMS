---
name: proxy-start
description: Start the pxpipe token-compression proxy and print the shell command to point Claude Code at it. Cuts Claude Code API bill 60-70% with zero project changes.
---

# /proxy-start — Boot the pxpipe cost-cutting proxy

Starts the pxpipe local proxy on `127.0.0.1:47821` and prints the exact env-var
line the user should paste into their shell so Claude Code routes through it.

Reference: [`.claude/proxy-recommended.md`](../proxy-recommended.md).

---

## What this command does

1. **Check node is available.** If `node --version` fails, print an error and
   stop — pxpipe requires Node 20+.

2. **Check the port isn't already occupied.** Try
   `curl -s http://127.0.0.1:47821/` — if 200, the proxy is already running.
   Report "Already running" and skip to step 4.

3. **Start pxpipe in the background** so the current terminal stays usable:

   ```bash
   # Cross-platform via nohup + disown, matches PowerShell Start-Process behaviour
   nohup npx pxpipe-proxy > "$HOME/.pxpipe/proxy.log" 2>&1 &
   disown
   ```

   Wait 3 seconds. Re-curl the dashboard to confirm boot.

4. **Print the user-facing next step.** Format:

   ```
   ────────────────────────────────────────────────────────────
   ✅ pxpipe running at http://127.0.0.1:47821/
   Dashboard:  http://127.0.0.1:47821/
   Log tail:   ~/.pxpipe/events.jsonl

   To route Claude Code through it, paste ONE of these:

   PowerShell:
       $env:ANTHROPIC_BASE_URL = "http://127.0.0.1:47821"

   Bash / Git Bash / macOS / Linux:
       export ANTHROPIC_BASE_URL="http://127.0.0.1:47821"

   Then run `claude` in the SAME terminal.

   Persist across shells: see .claude/proxy-recommended.md § "Persist across shells".
   ────────────────────────────────────────────────────────────
   ```

5. **Warn if a competing proxy is running.** If port `8787` is also up (the
   default Headroom port), warn:

   ```
   ⚠  Detected Headroom on port 8787. Do NOT run both — see
      .claude/proxy-recommended.md § "Never run both".
   ```

---

## Rules that apply

- `.claude/rules/rule-secrets-policy.md` — never write the pxpipe log path
  into `.env` files or the repo. The proxy log lives under `~/.pxpipe/` only.
- `.claude/rules/rule-git-safety.md` — no untracked pxpipe artefacts land in a
  commit; `.pxpipe/` is under `$HOME`, not the repo.

---

## When to use

- Every time you open a new terminal for Claude Code and haven't set
  `ANTHROPIC_BASE_URL` as a persistent env var.
- After a reboot.
- After running `/proxy-stop` (not implemented — you kill the process
  manually) and wanting to bring the proxy back up.

## When NOT to use

- CI runs — CI should hit Anthropic directly, no proxy.
- Any session where you're debugging a "did Anthropic actually see X payload?"
  question — the proxy transforms the payload, so raw-request tests get
  confusing results.
