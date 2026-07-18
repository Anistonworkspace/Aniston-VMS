# /explain — Understand Any Part of the Codebase

Use this when you or a new team member needs to understand how a specific module, function, feature, or workflow operates.

---

## Usage

```
/explain <target>
```

Examples:
- `/explain auth flow`
- `/explain BullMQ notification queue`
- `/explain RTK Query cache invalidation`
- `/explain prisma organizationId + zone-scope filtering`
- `/explain WebSocket gateway rooms (live-wall / incident board updates)`

---

## What this does

1. **Locate** — Find all files related to the target (NestJS controller, provider/service, guards, frontend hooks, store slices, DB model)
2. **Trace the full path** — UI component → RTK Query hook → NestJS controller route → guard/pipe chain → service → Prisma → DB → WebSocket gateway emit → UI refresh
3. **Explain each layer** in plain English — what it does, why it's structured that way, what the key decisions are
4. **Show data shapes** — the request body, response envelope, Prisma model shape, Redux state shape
5. **Point to rules** — which `.claude/rules/` files govern this area
6. **Suggest next steps** — if the person wants to extend or modify this feature, what files to touch and in what order

---

## Output format

```
## [Feature Name] — How it works

### Data flow
UI → [file] → [file] → [file] → DB

### Layer breakdown
- Frontend: [file:line] — what it does
- Controller: [file:line] — `@Controller`/route decorator, guard chain, HTTP method
- Service: [file:line] — business logic
- Prisma model: [file:line] — shape
- Sockets: [file:line] (if applicable)

### Key decisions
- [Why X is done this way]

### To extend this feature, touch:
1. [file] — add [what]
2. [file] — add [what]
```

---

## Rules that apply
- `.claude/rules/rule-logic-analysis.md` — full trace methodology
- `.claude/rules/rule-backend.md` — controller/service pattern
- `.claude/rules/rule-frontend.md` — RTK Query pattern
