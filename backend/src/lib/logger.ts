import { createLogger, format, transports } from 'winston';
import { env } from '../config/env.js';

const { combine, timestamp, json, colorize, simple, errors } = format;

const isProd = env.NODE_ENV === 'production';

// Keys whose values must never reach a log sink (passwords, tokens, secrets,
// credentials, RTSP passwords, etc.). Matched case-insensitively on the key
// name at any depth of a logged metadata object.
const SENSITIVE_KEY_RE =
  /(pass(word)?|secret|token|authorization|api[_-]?key|encryption[_-]?key|rtsp[_-]?pass|cookie|credential|refresh|private[_-]?key|mfa[_-]?secret|otp)/i;
const REDACTED = '[REDACTED]';

function redactValue(val: unknown, seen: WeakSet<object>): unknown {
  if (val === null || typeof val !== 'object') return val;
  if (seen.has(val as object)) return '[Circular]';
  seen.add(val as object);
  if (Array.isArray(val)) return val.map((v) => redactValue(v, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY_RE.test(k) ? REDACTED : redactValue(v, seen);
  }
  return out;
}

// Winston format that scrubs sensitive metadata before serialization. Preserves
// the reserved log fields (level/message/timestamp/stack) untouched.
const redactSensitive = format((info) => {
  const seen = new WeakSet<object>();
  for (const key of Object.keys(info)) {
    if (key === 'level' || key === 'message' || key === 'timestamp' || key === 'stack') continue;
    if (SENSITIVE_KEY_RE.test(key)) {
      (info as Record<string, unknown>)[key] = REDACTED;
      continue;
    }
    (info as Record<string, unknown>)[key] = redactValue((info as Record<string, unknown>)[key], seen);
  }
  return info;
});

export const logger = createLogger({
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  format: isProd
    ? combine(errors({ stack: true }), redactSensitive(), timestamp(), json())
    : combine(errors({ stack: true }), redactSensitive(), colorize(), simple()),
  transports: [new transports.Console()],
  // Silently ignore transport errors — never crash the app due to logging failure
  exitOnError: false,
});
