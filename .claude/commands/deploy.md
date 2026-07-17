---
name: deploy
description: Deploy the application to production. Runs pre-deploy checks, builds, migrates, and reloads PM2 via GitHub Actions or manual SSH.
---

Pre-deploy checklist (run before deploying):

1. Run /release-check and confirm there are no CRITICAL or HIGH findings
2. Confirm all tests pass: npm test
3. Confirm you are on main branch with no uncommitted changes
4. Confirm the git tag is ready: git tag v<version>

Deploy via GitHub Actions (recommended):
- Push to main branch — CI/CD runs automatically
- Monitor .github/workflows/deploy.yml for progress
- The workflow: build frontend → build backend → SCP to EC2 → npm run db:migrate → PM2 reload

Manual deploy (if CI is unavailable):
1. SSH to the EC2 server
2. cd /var/www/boilerplate-app
3. git pull origin main
4. npm install --workspaces
5. npm run build
6. DATABASE_URL=$PROD_URL npx prisma migrate deploy   ← ALWAYS migrate BEFORE reloading
7. pm2 reload ecosystem.config.cjs --update-env

Post-deploy verification:
- GET https://your-domain.com/api/health → expect 200 with all subsystems up
- Login with a test account and verify the primary workflow works
- Monitor PM2 logs for 5 minutes: pm2 logs boilerplate-backend

Rollback (if post-deploy verification fails):
- git checkout <last-good-commit> on EC2
- Rebuild and reload: npm run build && pm2 reload ecosystem.config.cjs
- NEVER auto-rollback. Report the error and wait for human decision before any rollback.

CRITICAL: Never run prisma db push in production. Always use prisma migrate deploy.
