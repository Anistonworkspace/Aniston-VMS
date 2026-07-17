import { createLogger, format, transports } from 'winston';
import { env } from '../config/env.js';

const { combine, timestamp, json, colorize, simple, errors } = format;

const isProd = env.NODE_ENV === 'production';

export const logger = createLogger({
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  format: isProd
    ? combine(errors({ stack: true }), timestamp(), json())
    : combine(errors({ stack: true }), colorize(), simple()),
  transports: [new transports.Console()],
  // Silently ignore transport errors — never crash the app due to logging failure
  exitOnError: false,
});
