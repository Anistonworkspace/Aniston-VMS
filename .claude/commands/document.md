# /document — Generate Documentation for a Module

Invokes `agent-docs` to write or update documentation for a specified module or the whole project.

---

## Usage

```
/document <target>
```

Examples:
- `/document item module`
- `/document auth API`
- `/document all swagger`
- `/document prisma schema`
- `/document frontend components`

---

## What gets generated

### Module README (`backend/src/modules/<name>/README.md`)
- What the module does (1 paragraph)
- Endpoints table: method, path, auth required, permission, description
- Request/response examples for each endpoint
- Business rules enforced
- State machine diagram (if status fields exist)
- Error codes the module can return

### Swagger JSDoc annotations
For every controller method that lacks `@swagger` comments:
```ts
/**
 * @swagger
 * /api/items:
 *   get:
 *     summary: List items in the organization
 *     tags: [Item]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated item list
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
```

### ADR (Architecture Decision Record)
Written to `memory/decisions/NNNN-<name>.md` when:
- A non-obvious design decision was made in this module
- A library was chosen for this module

### Frontend component docs
- Props table (name, type, required, default, description)
- Usage example snippet
- Note which RTK Query tags are used

---

## What NOT to document
- What the code does (well-named functions already do this)
- The current fix or PR ("added for issue #123")
- Internal implementation details that are obvious from reading

The focus is always: **WHY this exists, WHAT it accepts/returns, HOW to use it.**

---

## Rules that apply
- `.claude/rules/rule-api.md` — response format for Swagger examples
- `.claude/rules/rule-memory-system.md` — ADR creation rules
