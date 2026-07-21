import morgan from 'morgan';
import type { IncomingMessage } from 'http';

morgan.token('id', (req) => (req as { id?: string }).id ?? '-');

// Query params whose values must never reach an access log, even though the app
// now carries media auth in an HttpOnly cookie (never in a URL). This is defense
// in depth: direct/test callers may still hit /api/media/authorize?exp=&sig=, and
// any future signed-URL path is covered automatically.
const REDACT_PARAM_RE = /^(sig|exp|token|sig[_-]?nature|signature|access[_-]?token|refresh[_-]?token|key)$/i;

/** Redact sensitive query-param VALUES while keeping the path + param names. */
function redactUrl(rawUrl: string): string {
  const qIdx = rawUrl.indexOf('?');
  if (qIdx < 0) return rawUrl;
  const path = rawUrl.slice(0, qIdx);
  const query = rawUrl.slice(qIdx + 1);
  const redacted = query
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      const name = eq >= 0 ? pair.slice(0, eq) : pair;
      return REDACT_PARAM_RE.test(decodeURIComponent(name)) ? `${name}=[REDACTED]` : pair;
    })
    .join('&');
  return `${path}?${redacted}`;
}

// Override morgan's :url so token-bearing query params never appear in the log.
morgan.token('url', (req: IncomingMessage) => redactUrl((req as { originalUrl?: string; url?: string }).originalUrl ?? (req as IncomingMessage).url ?? '-'));

// Morgan access log — req.id is set by requestIdContext (middleware/requestId.ts)
// which must run BEFORE this middleware in app.ts.
export const requestLogger = morgan(
  ':id :method :url :status :res[content-length] - :response-time ms'
);
