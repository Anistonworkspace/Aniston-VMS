---
name: proxy-status
description: Report whether pxpipe is running and how many tokens it has saved this session. Use to sanity-check the cost-cutting proxy.
---

# /proxy-status — Report proxy state and savings

Quick health-check for the pxpipe proxy. Prints:

- Whether the proxy is up on `127.0.0.1:47821`
- Total request count since boot
- Cumulative tokens saved
- Estimated cost savings in USD (dashboard reports it)
- The current `ANTHROPIC_BASE_URL` env value (from the user's shell)

Reference: [`.claude/proxy-recommended.md`](../proxy-recommended.md).

---

## What this command does

1. **Check port 47821.** If the curl fails, print:

   ```
   ❌ pxpipe is NOT running on 127.0.0.1:47821.
      Run /proxy-start to boot it.
   ```
   Stop here.

2. **Fetch the dashboard stats.** `curl -s http://127.0.0.1:47821/api/stats`
   returns JSON like:

   ```json
   {
     "startedAt": "2026-07-07T14:22:00Z",
     "requestCount": 47,
     "tokensSavedTotal": 328440,
     "estimatedUsdSaved": 4.93,
     "models": {
       "claude-opus-4-7": { "requests": 41, "tokensSaved": 300100 },
       "claude-haiku-4-5-20251001": { "requests": 6, "tokensSaved": 28340 }
     }
   }
   ```

3. **Print a human-friendly summary:**

   ```
   ────────────────────────────────────────────────────────────
   ✅ pxpipe UP  (started 3h 22m ago)

   Requests routed:   47
   Tokens saved:      328,440
   Estimated $ saved: $4.93

   Per model:
     claude-opus-4-7            41 requests   300,100 tokens saved
     claude-haiku-4-5-20251001   6 requests    28,340 tokens saved

   ANTHROPIC_BASE_URL:  <value from shell, or WARN if unset>
   ────────────────────────────────────────────────────────────
   ```

4. **Warn if `ANTHROPIC_BASE_URL` is unset or doesn't point at the proxy:**

   ```
   ⚠  ANTHROPIC_BASE_URL is not set — your current shell isn't
      routing through pxpipe. See .claude/proxy-recommended.md.
   ```

5. **Warn if the proxy has been up > 7 days without a restart** — package
   updates might have been released:

   ```
   💡 Proxy has been running for 8d. Consider restarting after `npx pxpipe-proxy@latest`.
   ```

---

## When to use

- Before assuming your last session was cheap — verify the proxy was actually
  handling the traffic.
- After `/proxy-start` to confirm boot succeeded.
- Weekly, to see cumulative savings.

## Rules that apply

- `.claude/rules/rule-secrets-policy.md` — do NOT dump the raw dashboard JSON
  into memory files or the repo. It's session-scoped stats, not persistent
  state.
