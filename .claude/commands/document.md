# /document — Generate Documentation for a Module

Invokes `agent-docs` to write or update documentation for a specified module or the whole project.

---

## Usage

```
/document <target>
```

Examples:
- `/document camera module`
- `/document auth API`
- `/document all swagger`
- `/document prisma schema`
- `/document frontend components`

---

## What gets generated

### Module README (`apps/api/src/modules/<name>/README.md`)
- What the module does (1 paragraph)
- Endpoints table: method, path, auth required, permission, description
- Request/response examples for each endpoint
- Business rules enforced
- State machine diagram (if status fields exist — e.g. Camera health, Incident lifecycle)
- Error codes the module can return

### `@nestjs/swagger` decorators
For every controller method that lacks Swagger decorators:
```ts
@Get()
@ApiOperation({ summary: 'List cameras in the organization' })
@ApiBearerAuth()
@ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
@ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
@ApiResponse({ status: 200, description: 'Paginated camera list', type: CameraListResponseDto })
@ApiResponse({ status: 401, description: 'Unauthorized' })
@ApiResponse({ status: 403, description: 'Forbidden' })
@RequirePermission('cameras.read')
findAll(@Query() query: ListCamerasDto) {
  return this.camerasService.findAll(query);
}
```
Prefer typed response DTOs (`type: CameraListResponseDto`) over inline schemas so the
generated OpenAPI doc and the RTK Query codegen on `apps/web` stay in sync.

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
