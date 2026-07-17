import type { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { env } from '../config/env.js';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', 404, message);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super('VALIDATION_ERROR', 400, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', 403, message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super('CONFLICT', 409, message);
  }
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const reqId = (req as { id?: string }).id;
  const log = (msg: string) => console.error(`[error] [${reqId ?? '-'}] ${msg}`);

  if (err instanceof AppError) {
    log(`${err.code} ${err.message}`);
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    log(`VALIDATION_ERROR ${JSON.stringify(err.issues)}`);
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: err.issues },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    log(`PRISMA_${err.code}`);
    if (err.code === 'P2002') {
      res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Resource already exists' } });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } });
      return;
    }
  }

  log(`UNEXPECTED ${err instanceof Error ? err.stack : String(err)}`);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: env.NODE_ENV === 'production' ? 'Internal server error' : (err instanceof Error ? err.message : String(err)),
    },
  });
};
