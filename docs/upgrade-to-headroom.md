# Upgrade from pxpipe to Headroom

pxpipe is the default proxy in this repo (see
[`.claude/proxy-recommended.md`](../.claude/proxy-recommended.md)). Headroom is
a more powerful alternative — swap only when you've verified pxpipe savings
and want deeper compression, multiple providers, or MCP-native wiring.

Repo: [`github.com/headroomlabs-ai/headroom`](https://github.com/headroomlabs-ai/headroom).

---

## Why upgrade

| Capability | pxpipe | Headroom |
|---|---|---|
| Anthropic API cost cut | 60–70 % | 60–95 % |
| JSON tool-output compression | no | yes (SmartCrusher) |
| Code / AST compression | no | yes (CodeCompressor) |
| Prose compression (ML model) | no | yes (Kompress-v2-base) |
| Reversible compression (LLM can re-hydrate) | no | yes |
| Cross-agent shared memory | no | yes |
| MCP server mode | no | yes |
| Works with Bedrock / Vertex / OpenRouter | no | yes |
| First-run download | ~5 MB (npx cache) | ~200 MB (ML model) |
| Cold-start time | ~2 sec | ~15 sec |
| Runtime dep | Node ≥ 20 | Python ≥ 3.10 |

Rule of thumb: if your Claude Code sessions blow past 200k tokens routinely
(large audits, /build-loop runs, big file dumps), Headroom pays back the
setup cost. Otherwise stay on pxpipe.

---

## Prerequisites

- Python ≥ 3.10 (`python --version`). Install from python.org if missing.
- `Bash(pip *)` is already in `.claude/settings.json` allow-list.
- Sufficient disk for the ~200 MB ML model (cached to `~/.cache/huggingface/`).

---

## Install

```powershell
pip install "headroom-ai[all]"
```

Verify:

```powershell
headroom --version
```

---

## Pick ONE deployment mode

You cannot run pxpipe AND Headroom simultaneously — both intercept
`/v1/messages` and will conflict. **Stop pxpipe first:** kill the
`npx pxpipe-proxy` process (or reboot).

### Mode A — Wrap mode (drop-in replacement for pxpipe)

Simplest — Headroom launches Claude Code as a child process:

```powershell
headroom wrap claude
```

Set `ANTHROPIC_BASE_URL` back to unset (or delete it from Windows env vars) —
in wrap mode Headroom handles routing internally, no proxy URL needed.

### Mode B — Standalone proxy (identical pattern to pxpipe)

```powershell
# Terminal 1
headroom proxy --port 8787

# Terminal 2
$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:8787"
claude
```

Note the port change — 8787 instead of pxpipe's 47821. Update your persistent
Windows env var accordingly.

### Mode C — MCP server (deepest integration with this repo) ⭐

This is the mode the boilerplate is designed for. Headroom becomes a tool the
model can call on demand instead of intercepting every request.

1. Start the MCP server (leave running):

   ```powershell
   headroom mcp
   ```

2. Add it to `.claude/mcp.json` (create if it doesn't exist yet — Phase 2 of
   the boilerplate-v2 plan will do this centrally):

   ```jsonc
   {
     "mcpServers": {
       "headroom": {
         "command": "headroom",
         "args": ["mcp"],
         "env": {}
       }
     }
   }
   ```

3. Restart `claude` — `headroom` appears in `claude mcp list`.

4. Now agents can call `mcp__headroom__compress` and
   `mcp__headroom__recall` on demand instead of every prompt going through
   compression.

Trade-off: less automatic than wrap mode. Best paired with the boilerplate's
existing MCP catalog (Phase 2).

---

## Configure per model

```powershell
$env:HEADROOM_MODELS = "claude-opus-*,claude-fable-*"
```

Same shape as `PXPIPE_MODELS`.

## Configure per content type

```powershell
$env:HEADROOM_STRATEGIES = "json:aggressive,code:conservative,prose:auto"
```

Full list of strategies in `headroom config --help`.

---

## Rollback to pxpipe

1. `pip uninstall headroom-ai`
2. Delete the `headroom` entry from `.claude/mcp.json`
3. Restore `ANTHROPIC_BASE_URL=http://127.0.0.1:47821` in your env
4. `/proxy-start`

No project source changes to revert — pure config.

---

## Data & privacy

- Everything runs on `127.0.0.1`. No requests leave your machine except the
  normal Anthropic API call that Claude Code would make anyway.
- The ML model is downloaded from HuggingFace on first run and cached
  locally. All inference is local — no data sent to HuggingFace.
- Reversible-compression cache lives at `~/.headroom/cache/`. Purge with
  `headroom cache purge` when you rotate.
- Do NOT ship `~/.headroom/` in backups or Docker images that leave your
  laptop — the cache may contain compressed originals of your code.

---

## FAQ

**Q: Can I run pxpipe and Headroom on different ports so they don't collide?**
A: No — even on different ports, both set `ANTHROPIC_BASE_URL`. You'd point
the CLI at only one anyway. Pick.

**Q: Does Headroom work with Fable, Opus 4.7, Sonnet 5, Haiku 4.5?**
A: Yes. It auto-detects the model from the request. Adjust
`HEADROOM_MODELS` to skip cheap models (Haiku) where compression overhead
isn't worth it.

**Q: What breaks if I upgrade mid-session?**
A: Nothing catastrophic — the current in-flight request finishes on whichever
proxy was live when it started. Future requests use the new one. Simplest is
to close and re-open the terminal.
