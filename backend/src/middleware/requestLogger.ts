import morgan from 'morgan';

morgan.token('id', (req) => (req as { id?: string }).id ?? '-');

// Morgan access log — req.id is set by requestIdContext (middleware/requestId.ts)
// which must run BEFORE this middleware in app.ts.
export const requestLogger = morgan(
  ':id :method :url :status :res[content-length] - :response-time ms'
);
