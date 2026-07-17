# Skill — Email Patterns

Nodemailer + BullMQ email worker, HTML templates, welcome/reset flows.

---

## Email service (Nodemailer transport)

```typescript
// backend/src/services/email.service.ts
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

export const emailService = {
  async send(to: string, subject: string, html: string): Promise<void> {
    await transport.sendMail({
      from: `"${env.APP_NAME}" <${env.SMTP_FROM}>`,
      to,
      subject,
      html,
    });
  },
};
```

`.env` keys required:
```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=no-reply@example.com
SMTP_PASS=secret
SMTP_FROM=no-reply@example.com
APP_NAME="Boilerplate App"
```

---

## BullMQ email queue + worker

```typescript
// backend/src/jobs/queues.ts (add to existing queues file)
import { Queue } from 'bullmq';
import { bullConnection } from '../lib/redis.js';
import { JobQueueName } from '@boilerplate/shared';

export const emailQueue = new Queue(JobQueueName.EMAIL, { connection: bullConnection });
```

```typescript
// backend/src/jobs/workers/email.worker.ts
import { Worker } from 'bullmq';
import { bullConnection } from '../../lib/redis.js';
import { JobQueueName } from '@boilerplate/shared';
import { emailService } from '../../services/email.service.js';
import { renderWelcome, renderPasswordReset, renderOtp } from '../../services/emailTemplates.js';
import { logger } from '../../lib/logger.js';

export interface EmailJobData {
  type: 'welcome' | 'password-reset' | 'otp';
  to: string;
  payload: Record<string, string>;
}

export const emailWorker = new Worker<EmailJobData>(
  JobQueueName.EMAIL,
  async (job) => {
    const { type, to, payload } = job.data;
    let subject = '';
    let html = '';

    if (type === 'welcome') {
      subject = `Welcome to ${payload.appName}!`;
      html = renderWelcome(payload);
    } else if (type === 'password-reset') {
      subject = 'Reset your password';
      html = renderPasswordReset(payload);
    } else if (type === 'otp') {
      subject = 'Your verification code';
      html = renderOtp(payload);
    }

    await emailService.send(to, subject, html);
    logger.info('Email sent', { jobId: job.id, type, to });
  },
  { connection: bullConnection, concurrency: 5 },
);

emailWorker.on('failed', (job, err) => {
  logger.error('Email job failed', {
    jobId: job?.id,
    queue: JobQueueName.EMAIL,
    error: err.message,
    stack: err.stack,
  });
});
```

---

## HTML email templates

```typescript
// backend/src/services/emailTemplates.ts
// Inline styles are required — email clients strip <style> tags

function baseLayout(content: string, preheader = ''): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1ece3;font-family:Arial,Helvetica,sans-serif;">
  ${preheader ? `<span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>` : ''}
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:#0073ea;padding:24px 32px;">
          <span style="color:#fff;font-size:20px;font-weight:700;">Boilerplate App</span>
        </td></tr>
        <tr><td style="padding:32px;">${content}</td></tr>
        <tr><td style="padding:16px 32px;background:#f9f9f9;color:#888;font-size:12px;text-align:center;">
          © ${new Date().getFullYear()} Aniston Technologies LLP. All rights reserved.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function renderWelcome(p: { name: string; appName: string; loginUrl: string }): string {
  return baseLayout(`
    <h1 style="color:#1a1a1a;font-size:24px;margin:0 0 16px;">Welcome, ${p.name}!</h1>
    <p style="color:#555;line-height:1.6;">Your account on <strong>${p.appName}</strong> is ready.</p>
    <a href="${p.loginUrl}"
       style="display:inline-block;margin-top:24px;padding:12px 28px;background:#0073ea;
              color:#fff;border-radius:4px;text-decoration:none;font-weight:600;">
      Sign in
    </a>
  `, `Your ${p.appName} account is ready`);
}

export function renderPasswordReset(p: { name: string; resetUrl: string; expiresIn: string }): string {
  return baseLayout(`
    <h1 style="color:#1a1a1a;font-size:24px;margin:0 0 16px;">Reset your password</h1>
    <p style="color:#555;line-height:1.6;">Hi ${p.name}, click below to reset your password. This link expires in <strong>${p.expiresIn}</strong>.</p>
    <a href="${p.resetUrl}"
       style="display:inline-block;margin-top:24px;padding:12px 28px;background:#0073ea;
              color:#fff;border-radius:4px;text-decoration:none;font-weight:600;">
      Reset password
    </a>
    <p style="color:#999;font-size:12px;margin-top:24px;">If you didn't request this, you can ignore this email.</p>
  `, 'Reset your password');
}

export function renderOtp(p: { otp: string; expiresIn: string }): string {
  return baseLayout(`
    <h1 style="color:#1a1a1a;font-size:24px;margin:0 0 16px;">Your verification code</h1>
    <p style="color:#555;">Use this code to verify your account:</p>
    <div style="margin:24px 0;text-align:center;font-size:40px;font-weight:700;
                letter-spacing:12px;color:#0073ea;font-family:monospace;">${p.otp}</div>
    <p style="color:#999;font-size:12px;">Expires in ${p.expiresIn}. Never share this code.</p>
  `, 'Your verification code');
}
```

---

## Sending from a service

```typescript
// In any service method — enqueue, don't await SMTP directly
import { emailQueue } from '../../jobs/queues.js';

// Welcome email after user registration
await emailQueue.add('welcome', {
  type: 'welcome',
  to: user.email,
  payload: {
    name: user.name,
    appName: 'Boilerplate App',
    loginUrl: `${env.FRONTEND_URL}/login`,
  },
});

// Password reset
await emailQueue.add('password-reset', {
  type: 'password-reset',
  to: user.email,
  payload: {
    name: user.name,
    resetUrl: `${env.FRONTEND_URL}/reset-password?token=${token}`,
    expiresIn: '15 minutes',
  },
});
```

---

## env.ts additions

```typescript
// Add to backend/src/config/env.ts schema
SMTP_HOST: z.string(),
SMTP_PORT: z.coerce.number().default(587),
SMTP_USER: z.string(),
SMTP_PASS: z.string(),
SMTP_FROM: z.string().email(),
```

---

## Checklist

- [ ] SMTP credentials in `.env` — never hardcoded
- [ ] All sends go through `emailQueue.add()` — never `emailService.send()` directly from a controller
- [ ] Templates use inline styles — not `<style>` blocks (stripped by Gmail etc.)
- [ ] Reset-token links expire — never permanent URLs
- [ ] OTP never logged — only sent via email
- [ ] `emailWorker.on('failed')` logs use structured logger, never console.error
- [ ] `concurrency: 5` on the email worker — SMTP rate limits
