# Contributing Guide

How to contribute to **Aniston VMS** — the multi-tenant CCTV Video Management System built in
this repo. Product truth lives in `docs/01-PRD.md` … `docs/06-implementation-plan.md` and
`CLAUDE.md`; follow the staged plan in `docs/06-implementation-plan.md`.

---

## Branch naming

```
feature/short-description        New feature
fix/short-description            Bug fix
hotfix/short-description         Emergency production fix
refactor/short-description       Refactor with no behavior change
chore/short-description          Config, deps, tooling
docs/short-description           Documentation only
```

Examples:
```
feature/add-invoice-module
fix/login-redirect-loop
hotfix/null-check-payment-service
```

---

## Commit message format

```
<type>(<scope>): <short summary>

<optional body — the WHY, not the what>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`

Examples:
```
feat(invoice): add invoice list and creation endpoints
fix(auth): refresh token not cleared on logout
refactor(item): extract address validation to shared util
test(invoice): add unit tests for invoice service
```

Rules:
- Present tense: "add feature" not "added feature"
- Max 72 characters in the subject line
- Explain WHY in the body, not what (the diff shows what)

---

## Before opening a PR

Run the checklist:
```bash
npx tsc --noEmit         # zero TypeScript errors
npm run lint             # zero lint errors
npm test                 # all tests pass
```

For any PR that touches security, auth, or the Prisma schema — also run:
```bash
# In Claude Code:
/security-scan
/audit
```

---

## PR checklist

Every PR must have:

- [ ] Linked issue or task description
- [ ] TypeScript compiles with no errors
- [ ] Lint passes with no errors
- [ ] All existing tests pass
- [ ] New tests written for the new code (per rule-testing-standards.md)
- [ ] No console.log or debugger left in production code
- [ ] No secrets or .env committed
- [ ] Memory updated: plan moved to _archive/, changes/ entry written (run `/done`)

---

## Using Claude agents for code review

Before requesting a human review on your PR, run:

```
# In Claude Code:
agent-code-review
```

Claude will check your diff against all project rules and flag BLOCK / CHANGE / APPROVE items. Fix all BLOCK items before pushing.

For security-sensitive changes (auth, payments, file uploads):
```
/security-scan
```

---

## Adding a new feature module

Always use the scaffold command — never create module files manually:

```
/new-module <name>
```

This creates all files following project conventions. Manually creating them risks missing the security middleware, organizationId scoping, or RBAC permissions.

---

## Database changes

1. Edit `prisma/schema.prisma`
2. Run `npm run db:migrate` (dev) — this creates a migration file
3. Never edit the generated migration file
4. Commit both the schema change and the migration file together
5. In production, migrations run automatically during deploy (`prisma migrate deploy`)

See [.claude/rules/rule-database-migrations.md](.claude/rules/rule-database-migrations.md) for the full policy.

---

## Secrets policy

Never commit:
- `.env` or any `.env.*` file
- `.jks`, `.keystore` files
- `google-services.json`
- `.apk`, `.aab`, `.ipa` files
- Any hardcoded password, API key, or token

See [.claude/rules/rule-secrets-policy.md](.claude/rules/rule-secrets-policy.md) for the full policy.

---

## Questions?

Open a Claude Code chat and ask. Claude has full context of the project via the `memory/` system.
Or open a GitHub issue with the `question` label.
