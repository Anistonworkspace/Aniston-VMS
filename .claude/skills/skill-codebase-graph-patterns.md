# Skill — Codebase Knowledge Graph Patterns (Graphify)

Graphify builds a queryable knowledge graph of the Aniston VMS monorepo —
`backend/` (NestJS API + BullMQ workers), `frontend/` (React/RTK Query), and
`shared/` (`@aniston-vms/shared`), plus docs — so agents can answer "what
depends on this?" and "why was this designed this way?" without grep-only
guessing.

Reference: [`graphify.net`](https://graphify.net/) · Repo:
[`github.com/warioddly/graphify`](https://github.com/warioddly/graphify)
(open-source, MIT).

---

## When to build

Every time the shape of the codebase shifts:

- New Prisma model or renamed column in `prisma/schema.prisma` (e.g. a new
  field on `Camera`, `Incident`, `HealthCheck`, or `Escalation`)
- New backend module (new `<name>.service.ts` under `backend/src/modules/`,
  e.g. `backend/src/modules/escalation/escalation.service.ts`, or a new
  `@Processor` worker)
- New frontend feature (new `frontend/src/features/<name>/` directory, e.g.
  `features/incidents/`)
- Big refactor that moves imports around

Otherwise: weekly, or before a session where you'll be asked "what calls X?"
a lot.

---

## Install (one-time)

```powershell
pip install graphify
```

Node-only alternative (if you prefer no Python dep): a .NET port exists —
`elbruno/graphify-dotnet` — same concepts, different tooling.

---

## Build the graph

```powershell
graphify build --root . --output .claude/graph --exclude "node_modules,dist,coverage,.next,.claude/logs"
```

Produces:

- `.claude/graph/graph.json` — queryable graph (nodes: functions, classes,
  Prisma models, files, docs; edges: import, call, reference, depends-on)
- `.claude/graph/graph.html` — interactive visualization (open in browser)
- `.claude/graph/graph.meta.json` — build timestamp, source-file inventory,
  detected communities

**Regenerate incrementally** (fast — only re-processes changed files):

```powershell
graphify build --root . --output .claude/graph --incremental
```

Add `.claude/graph/` to `.gitignore` — it's regenerable, don't commit binary
artifacts. (This repo's `.gitignore` already ignores it — the Stage 1 setup
task in `docs/06-implementation-plan.md` added the entry.)

---

## Query patterns

### "What depends on this symbol?"

```powershell
graphify query deps "IncidentService.acknowledge" --graph .claude/graph/graph.json
```

Returns every function / component / test that imports or calls the symbol,
with file:line pointers.

### "Explain this file"

```powershell
graphify query explain backend/src/modules/camera/camera.service.ts
```

Returns a natural-language summary of the file + inbound/outbound edges.

### "Find related concepts"

```powershell
graphify query community incident
```

Uses graph community detection to surface the cluster of code + docs
semantically related to `Incident` (service, controller, DTOs, RTK Query
slice, `IncidentKanban`, `EscalationTimeline`, tests). Useful for "give me
everything touching incident triage" without hand-tracing.

---

## Wire into Claude Code sessions

Two integration modes — pick per session:

### Mode A — Manual reference (simplest)

Include a specific slice of the graph in your prompt:

```powershell
graphify query deps "createIncidentFromHealthCheck" | claude
# or with the /graph command:
/graph deps createIncidentFromHealthCheck
```

The graph output goes into the prompt context; the model answers with the
actual dependency chain.

### Mode B — MCP integration (deepest — not yet auto-wired)

Once Graphify ships an MCP server (or via a wrapper), add it to
`.claude/mcp.json` and agents can query on demand instead of front-loading
the whole graph. Placeholder for when the MCP variant lands.

---

## Regeneration reminder

`.claude/hooks/lint-on-save.sh` emits a reminder when you edit any
`.service.ts`, `.processor.ts`, or `schema.prisma`:

```
REMINDER: Structure changed — run '/graph build' to refresh the codebase graph.
```

You don't have to obey it every time. Rebuild before a session where you'll be
doing deep exploration; skip during rapid edit-save-edit loops.

---

## Query recipes for common questions

| Question | Command |
|---|---|
| Which components call `useAcknowledgeIncidentMutation`? | `graphify query deps "useAcknowledgeIncidentMutation"` |
| What routes hit `HealthCheckService.recordCheck`? | `graphify query inbound "HealthCheckService.recordCheck" --type route` |
| What's in the "health-monitoring" domain? | `graphify query community health` |
| Which files import the camera-credential encryption helper (`AES-256-GCM`)? | `graphify query importers "lib/encryption"` |
| Give me an architectural overview | `graphify report architecture --graph .claude/graph/graph.json` |

---

## Warning — don't ship graph.json publicly

`graph.json` includes symbol names + docstrings + file paths from the whole
monorepo — including camera/site naming and RBAC logic. Fine for internal
use; **don't publish it with any public release** since the codebase has
private business logic. Add `.claude/graph/` to `.gitignore` (already done)
and confirm your CI doesn't zip it into release artifacts.

---

## Checklist

- [ ] `.claude/graph/` is in `.gitignore`
- [ ] `graphify build` runs after every Prisma schema or `.service.ts`/`.processor.ts` change
- [ ] Cross-agent-relevant queries use `/graph deps` or `/graph explain`
      instead of ad-hoc grep
- [ ] Weekly rebuild scheduled (or before every audit session)
- [ ] `graph.json` never committed