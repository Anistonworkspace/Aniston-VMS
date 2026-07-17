import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';

interface ValidateSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

// validateRequest — validates body, query, and/or params in one middleware.
// Replaces the old single-source validate() — use this in all route files.
export function validateRequest(schemas: ValidateSchemas): RequestHandler {
  return (req, _res, next) => {
    for (const source of ['body', 'query', 'params'] as const) {
      const schema = schemas[source];
      if (!schema) continue;
      const result = schema.safeParse(req[source]);
      if (!result.success) return next(result.error);
      (req as unknown as Record<string, unknown>)[source] = result.data;
    }
    next();
  };
}

// Legacy single-source alias — keeps existing callers working during migration.
// Prefer validateRequest({ body: schema }) in new code.
export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body'): RequestHandler {
  return validateRequest({ [source]: schema } as ValidateSchemas);
}
