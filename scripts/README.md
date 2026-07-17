# Scripts

One-off patch, fix, and maintenance scripts live here. Each script should:

1. Be idempotent (safe to re-run)
2. Print clear status output
3. Reference the issue/PR that motivated it in a header comment
4. Be deleted once the rollout is complete and no longer needed

Naming: `YYYY-MM-DD-<short-description>.ts` or `.sh`.

Run via:
```bash
npx tsx scripts/2026-05-17-backfill-something.ts
```
