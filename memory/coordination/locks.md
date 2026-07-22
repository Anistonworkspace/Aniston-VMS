# File Locks

A registry of which agent currently holds editing rights over which files. Prevents two agents from clobbering each other's work when running in parallel.

## How to use

**Before editing** a file or set of files, append a lock entry. **When done**, mark it RELEASED (do not delete — keeps the audit trail).

If you see an active lock on a file you need to edit:
1. Check the timestamp — locks older than 30 minutes without status updates are stale; you may take over after writing a `STOLEN by <agent> at <time>` note.
2. Otherwise, wait or coordinate via [handoffs.md](handoffs.md).

## Lock format

```markdown
- **<scope>** — held by `<agent-name>` since YYYY-MM-DD HH:MM
  - Files: `path/a.ts`, `path/b.ts`
  - Reason: <one line>
  - Plan: [../plans/_active/...](../plans/_active/...)
  - Status: ACTIVE | RELEASED YYYY-MM-DD HH:MM | STOLEN
```

## Current locks

- **prod-deploy-ghcr-cicd** — held by `claude` since 2026-07-22 10:40
  - Files: `docker/docker-compose.prod.yml`, `scripts/deploy-prod.sh`, `.github/workflows/deploy.yml`, `nginx/vms.anistonav.com.conf`
  - Reason: Isolated GHCR push-to-deploy CI/CD for vms.anistonav.com on the shared EC2 host (no other stack touched).
  - Plan: [../plans/_active/2026-07-22-prod-deploy-ghcr-cicd.md](../plans/_active/2026-07-22-prod-deploy-ghcr-cicd.md)
  - Status: ACTIVE

## Recently released

- **commit-and-push-cleanup** - held by `codex` since 2026-07-08 14:10
  - Files: `package.json`, `prisma/seed.ts`, `memory/project-state.md`, `memory/changes/2026-07-08-changes.md`
  - Reason: Fix pre-commit blockers and push current project changes to GitHub.
  - Plan: [../plans/_active/2026-07-08-agent-power-plan.md](../plans/_active/2026-07-08-agent-power-plan.md)
  - Status: RELEASED 2026-07-08 14:18
