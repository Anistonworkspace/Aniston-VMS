import { AsyncLocalStorage } from 'node:async_hooks';
import { nanoid } from 'nanoid';
import type { RequestHandler } from 'express';
import { logger } from '../lib/logger.js';

// Augment Express Request with the request id set below. (Previously lived in
// auth.middleware.ts; kept here so the skeleton compiles without an auth module.)
declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
  }
}

type LogLevel = 'error' | 'warn' | 'info' | 'debug';
type LogContext = { requestId: string };

const als = new AsyncLocalStorage<LogContext>();

/**
 * Express middleware: extracts (or generates) a request id, attaches it to
 * req.id + response header, and runs the rest of the request inside an
 * AsyncLocalStorage scope. Any log() call downstream — even from inside a
 * service, a BullMQ worker handler triggered by a request, or a setImmediate
 * callback — picks up the same requestId without needing to pass req around.
 *
 * Must run BEFORE any route handler. See backend/src/app.ts.
 */
export const requestIdContext: RequestHandler = (req, res, next) => {
  const id = (req.headers['x-request-id'] as string) ?? nanoid(12);
  req.id = id;
  res.setHeader('x-request-id', id);
  als.run({ requestId: id }, () => next());
};

/**
 * Structured log helper. Inside a request scope it auto-injects requestId.
 * Outside a request scope (workers, bootstrap, cron) it falls back to the
 * raw logger with no requestId.
 *
 * Prefer this over logger.info() inside request handlers — see
 * .claude/rules/rule-logging-standards.md.
 *
 * Example:
 *   log('info', 'Employee created', { entityId: emp.id, actorId: actor.id });
 *   log('error', 'Payment failed', { error: err.message, stack: err.stack });
 */
export function log(level: LogLevel, message: string, meta: Record<string, unknown> = {}): void {
  const ctx = als.getStore();
  if (ctx?.requestId) {
    logger.log(level, message, { requestId: ctx.requestId, ...meta });
  } else {
    logger.log(level, message, meta);
  }
}

/**
 * Read the current requestId without logging. Useful for downstream metadata
 * (Sentry tags, BullMQ job data, outgoing webhook headers).
 * Returns undefined when called outside a request scope.
 */
export function currentRequestId(): string | undefined {
  return als.getStore()?.requestId;
}
