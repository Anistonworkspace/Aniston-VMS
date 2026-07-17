# Proxy layer for Claude Code — token-cost reduction

You can cut Claude Code's Anthropic API bill 60–95 % by inserting a local proxy
that compresses context before it reaches the API. Two options — **pick ONE at
a time**, they'll conflict if both run on the same port.

**Default choice: pxpipe.** Simpler, one Node dep, ~60–70 % savings, works
out-of-the-box on Windows. If you outgrow it, upgrade to Headroom
(see [docs/upgrade-to-headroom.md](../docs/upgrade-to-headroom.md)).

---

## 1. pxpipe (recommended default)

Local proxy that renders bulky text context (system prompt, tool docs, older
conversation history) as PNG images before sending to Anthropic — because
images cost fewer tokens per character than raw text on Anthropic pricing.
Repo: [`github.com/teamchong/pxpipe`](https://github.com/teamchong/pxpipe).

- **Runtime:** Node.js ≥ 20 (already a hard project dep — no install needed
  beyond `npx`).
- **Cost impact:** 60–70 % lower API bill on Anthropic's Fable/Opus models,
  measured by the pxpipe project.
- **Impact on your project files:** none. It's a network proxy — no source
  changes.
- **Runtime dependency for freshers:** the `npx pxpipe-proxy` process must be
  running whenever you use Claude Code. Use `/proxy-start` (a slash command in
  this repo) so you don't have to remember.

### Start (PowerShell)

```powershell
# Terminal 1 — leave this running
npx pxpipe-proxy

# Terminal 2 — point Claude Code at the proxy for this session
$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:47821"
claude
```

### Start (Bash / Git Bash)

```bash
npx pxpipe-proxy &
export ANTHROPIC_BASE_URL="http://127.0.0.1:47821"
claude
```

### Persist across shells (Windows)

Set `ANTHROPIC_BASE_URL=http://127.0.0.1:47821` as a user environment variable:

```
Win+R → sysdm.cpl → Advanced → Environment Variables → New user variable
  Name:  ANTHROPIC_BASE_URL
  Value: http://127.0.0.1:47821
```

Re-open any terminal after saving. Every future `claude` session picks it up
automatically. Remember: the proxy must be running for the URL to resolve.

### Verify it's working

- Open `http://127.0.0.1:47821/` — dashboard with request count and tokens
  saved per session.
- Tail `~/.pxpipe/events.jsonl` — one line per `/v1/messages` call with exact
  savings.

### Configure per model (optional)

```powershell
$env:PXPIPE_MODELS = "claude-opus-*,claude-fable-*"
```

Only compresses calls matching those model patterns — skips Haiku since it's
already cheap.

### Stop / rollback

- `Ctrl+C` in the proxy terminal.
- Unset `ANTHROPIC_BASE_URL` — Claude Code goes back to talking to Anthropic
  directly.
- No files to revert.

---

## 2. Headroom (upgrade path)

Broader compression platform — not just pxpipe's image-render trick. Adds
content-aware compressors (JSON, code AST, prose ML model), reversible
compression, cross-agent shared memory, and an MCP-server mode.
Repo: [`github.com/headroomlabs-ai/headroom`](https://github.com/headroomlabs-ai/headroom).

Trade-offs vs pxpipe:

- **Pros:** 60–95 % savings on JSON, 15–20 % on code. Works across providers
  (not just Anthropic). Ships an MCP server so it plugs into this repo's MCP
  wiring natively.
- **Cons:** Python ≥ 3.10 dep. Downloads a ~200 MB HuggingFace ML model on
  first run. Longer cold start.

**Full install + wiring guide:** [`docs/upgrade-to-headroom.md`](../docs/upgrade-to-headroom.md).

---

## Never run both

pxpipe and Headroom both intercept `/v1/messages` — running both at the same
time double-compresses the payload, breaks the tokenizer, and Anthropic will
reject the request. Pick one. Kill the other before switching.

---

## Slash commands added by this repo

- `/proxy-start` — starts pxpipe in the background and prints the exact
  `ANTHROPIC_BASE_URL` line to paste into your shell.
- `/proxy-status` — hits the pxpipe dashboard and reports request count +
  tokens saved for the current session.

Both are in `.claude/commands/`. If they aren't picked up, run `claude` to
reload command definitions.

---

## FAQ

**Q: Does Anthropic support this?**
A: Yes — `ANTHROPIC_BASE_URL` is a first-class Claude Code env var for pointing
at proxies (self-hosted gateways, cost-tracking, corporate egress, etc.).

**Q: Will my API key still work?**
A: Yes. The proxy forwards your `x-api-key` / `Authorization` header
unchanged. It only touches the message payload.

**Q: What about Bedrock or Vertex?**
A: pxpipe targets Anthropic direct. If you use Bedrock/Vertex, Headroom is the
better fit — it's provider-agnostic.

**Q: Any risk of leaking data via the image?**
A: The proxy is local (`127.0.0.1`) — the image never leaves your machine
before it's sent as part of the normal Anthropic API call, which uses the same
TLS your `claude` CLI already uses. No new attack surface.

**Q: Can I keep this off in production CI?**
A: Yes. Set `ANTHROPIC_BASE_URL` only in your local shell profile, not in
GitHub Actions secrets. CI runs go direct.
