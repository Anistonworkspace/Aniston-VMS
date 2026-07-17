import http from 'node:http';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// Generic skeleton server. Boots an Express app with a health check and nothing
// else. Build your API by adding feature routers in app.ts — use `/new-module`
// or `/build-loop` in Claude Code, which follow .claude/skills/skill-mvc-patterns.md.
// ─────────────────────────────────────────────────────────────────────────────

function main(): void {
  const app = createApp();
  const httpServer = http.createServer(app);

  httpServer.listen(env.PORT, () => {
    logger.info('Server started', {
      port: env.PORT,
      health: `http://localhost:${env.PORT}/api/health`,
    });
  });

  const shutdown = (signal: string): void => {
    logger.info('Shutdown signal received', { signal });
    httpServer.close(() => process.exit(0));
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => {
    logger.error('Unhandled rejection', {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

main();
