# Skill — Email Patterns (Transactional + Incident/Escalation Alerts)

Aniston VMS sends two kinds of email: **auth/account** transactional mail (welcome, password
reset, MFA/TOTP-related OTP) and **incident/escalation alerts** (camera/site down, unresolved
escalation, recovery verified). WhatsApp Cloud API is the primary channel for incident/escalation
notifications (see `docs/02-TRD.md §12`, `docs/tech-stack-targets.md` "Notifications &
observability"); email via **AWS SES** is the secondary channel plus all auth-flow mail, and is
also where SES bounce/complaint handling lands. Nodemailer talks to SES over its SMTP interface —
same `nodemailer.createTransport({ ... })` call as any SMTP provider, just pointed at SES's
per-region SMTP endpoint with SES SMTP credentials (**not** your AWS IAM access key — SES issues
separate SMTP credentials).

All email is queued through BullMQ, never sent inline from a request handler — an SES hiccup must
never block an API response or an incident-creation transaction.

---

## Env config (`apps/api/src/config/env.ts`)

```typescript
SMTP_HOST: z.string().optional(),   // e.g. email-smtp.ap-south-1.amazonaws.com — SES SMTP endpoint, per environment
SMTP_PORT: z.coerce.number().int().optional(), // 587 (STARTTLS)
SMTP_USER: z.string().optional(),   // SES SMTP username (NOT the AWS access key id)
SMTP_PASS: z.string().optional(),   // SES SMTP password (NOT the AWS secret key)
SMTP_FROM: z.string().optional(),   // verified SES sender identity, e.g. alerts@<project domain>
APP_NAME: z.string().default('Aniston VMS'),
FRONTEND_URL: z.string(),           // used to build absolute links in emails
```

Never hardcode a real inbox in code or docs — every `SMTP_*` value above is a per-environment
placeholder; local/dev typically points at a catch-all (Mailhog/Ethereal), staging/prod point at
the verified SES identity for that environment.

---

## Mail service (`apps/api/src/notifications/mail.service.ts`, NestJS `@Injectable`)

```typescript
import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { env } from '../config/env';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private readonly transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false, // STARTTLS on 587, not implicit TLS
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });

  async sendMail(to: string, subject: string, html: string) {
    try {
      await this.transport.sendMail({ from: env.SMTP_FROM, to, subject, html });
    } catch (error) {
      this.logger.error({ error, to, subject }, 'Email send failed');
      throw error; // let the BullMQ worker's retry policy handle it
    }
  }
}
```

## Queue + worker (`apps/api/src/notifications/mail.queue.ts` producer, `apps/workers/src/mail/mail.worker.ts`)

```typescript
// apps/api/src/notifications/mail.queue.ts — producer, registered via the NestJS BullModule
import { JobQueueName, type EmailJobData } from '@aniston-vms/shared';
export const emailQueue = new Queue<EmailJobData>(JobQueueName.EMAIL, { connection: bullConnection });
```

```typescript
// apps/workers/src/mail/mail.worker.ts — @aniston-vms/workers resolves MailService from the Nest app context
import { Worker } from 'bullmq';
import { JobQueueName, type EmailJobData } from '@aniston-vms/shared';
import { MailService } from './mail.service';
import { renderIncidentAlert, renderEscalationAlert, renderWelcome, renderPasswordReset, renderOtp } from './email-templates';

const mail = new MailService();

export const emailWorker = new Worker<EmailJobData>(
  JobQueueName.EMAIL,
  async (job) => {
    const { type, to, payload } = job.data;
    switch (type) {
      case 'INCIDENT_ALERT':
        return mail.sendMail(to, `[Aniston VMS] Incident: ${payload.siteName}`, renderIncidentAlert(payload));
      case 'ESCALATION_ALERT':
        return mail.sendMail(to, `[Aniston VMS] Unresolved escalation: ${payload.siteName}`, renderEscalationAlert(payload));
      case 'WELCOME':
        return mail.sendMail(to, 'Welcome to Aniston VMS', renderWelcome(payload));
      case 'PASSWORD_RESET':
        return mail.sendMail(to, 'Reset your Aniston VMS password', renderPasswordReset(payload));
      case 'OTP':
        return mail.sendMail(to, 'Your Aniston VMS verification code', renderOtp(payload));
    }
  },
  { connection: bullConnection, concurrency: 5 },
);
```

`type` drives which template renders — incident/escalation payloads carry `siteName`, `zoneName`,
`cameraLabel`, `incidentId`, `severity`; auth payloads carry `resetUrl`/`loginUrl`/`expiresIn`/`otp`.

## Templates (`apps/api/src/notifications/email-templates.ts`)

```typescript
function baseLayout(appName: string, bodyHtml: string) {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;margin:0;padding:24px;background:#f5f7fa">
    <table style="max-width:480px;margin:0 auto;background:#fff;border-radius:var(--card-radius,8px);overflow:hidden">
      <tr><td style="padding:24px">${bodyHtml}</td></tr>
    </table>
    <p style="text-align:center;color:#8a8a8a;font-size:12px">© ${new Date().getFullYear()} ${appName}</p>
  </body></html>`;
}

export function renderIncidentAlert({ siteName, zoneName, cameraLabel, incidentId, severity }: IncidentAlertPayload) {
  return baseLayout(env.APP_NAME, `
    <h2 style="color:#c0392b">Incident — ${siteName} (${zoneName})</h2>
    <p><strong>${cameraLabel}</strong> reported <strong>${severity}</strong>.</p>
    <a href="${env.FRONTEND_URL}/incidents/${incidentId}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#0073ea;color:#fff;border-radius:6px;text-decoration:none">
      View incident
    </a>`);
}

export function renderPasswordReset({ resetUrl, expiresIn }: { resetUrl: string; expiresIn: string }) {
  return baseLayout(env.APP_NAME, `
    <h2>Reset your password</h2>
    <p>Click below to set a new password. This link expires in ${expiresIn}.</p>
    <a href="${resetUrl}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#0073ea;color:#fff;border-radius:6px;text-decoration:none">Reset password</a>
    <p style="color:#8a8a8a;font-size:12px;margin-top:16px">If you didn't request this, you can safely ignore this email.</p>`);
}
```

`renderIncidentAlert` / `renderEscalationAlert` are the VMS-specific templates — `renderWelcome`,
`renderPasswordReset`, `renderOtp` are the generic auth-flow templates every module in this repo
shares (see `skill-auth-patterns.md` for the MFA/TOTP flow the OTP template supports).

---

## Checklist before shipping an email change

- [ ] Every send goes through `emailQueue`, never `MailService.sendMail()` called directly from a NestJS controller
- [ ] `SMTP_*` values are read from `env`, never hardcoded — and never a real inbox in sample code
- [ ] `APP_NAME` renders as **Aniston VMS** everywhere in templates, not a leftover product name
- [ ] Incident/escalation templates link to `${FRONTEND_URL}/incidents/:id`, a real deep link
- [ ] Worker failures are logged with enough context (`to`, `type`, `incidentId`) to retry/diagnose
- [ ] No SES/SMTP credentials committed — only referenced via `env.SMTP_USER`/`env.SMTP_PASS`