# Skill — Input Sanitization & XSS Prevention

DOMPurify for rich text, file name sanitization, HTML stripping, safe render of user content.

---

## Backend — Zod validation as the primary defense

```typescript
// All inputs validated at the route layer — BEFORE reaching the service
// Zod strips unknown fields and enforces types — this is your first defense

// Good — Zod strips HTML tags from string inputs naturally via type coercion
// But for fields that explicitly allow text, add explicit sanitization too

import { z } from 'zod';

// Plain text — strip any HTML
const PlainTextSchema = z.string().transform(val => val.replace(/<[^>]*>/g, '').trim());

// Rich text (e.g. notes field) — DOMPurify on the backend
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const window  = new JSDOM('').window;
const DOMPurify = createDOMPurify(window as any);

const ALLOWED_TAGS  = ['p', 'b', 'i', 'u', 'strong', 'em', 'ul', 'ol', 'li', 'br'];
const ALLOWED_ATTRS = ['class'];

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRS,
  });
}

const RichTextSchema = z.string().transform(val => sanitizeHtml(val));

// Usage in validation file:
export const CreateAnnouncementSchema = z.object({
  title:   z.string().min(1).max(200).transform(s => s.trim()),
  content: RichTextSchema,      // sanitized rich text
});
```

---

## File name sanitization

```typescript
// backend/src/utils/fileUtils.ts
import path from 'path';

// Prevent path traversal and dangerous file names
export function sanitizeFileName(originalName: string): string {
  // Remove path separators, null bytes, and leading dots
  const base = path.basename(originalName)
    .replace(/[/\\]/g, '')
    .replace(/\0/g, '')
    .replace(/^\.+/, '');     // prevent hidden files like .htaccess

  // Only allow safe characters
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// Generate a safe stored filename (never expose original to filesystem)
export function generateStoredFileName(originalName: string): string {
  const ext   = path.extname(originalName).toLowerCase();
  const safe  = sanitizeFileName(path.basename(originalName, ext));
  const rand  = crypto.randomBytes(16).toString('hex');
  return `${rand}_${safe.slice(0, 40)}${ext}`;
}

// Usage in upload service:
const storedName = generateStoredFileName(file.originalname);
const storedPath = path.join(UPLOAD_DIR, storedName);
```

---

## MIME type + extension validation

```typescript
// backend/src/middleware/upload.ts
import multer from 'multer';
import path from 'path';

const ALLOWED_MIME_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  document: ['application/pdf', 'application/msword',
             'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  spreadsheet: ['application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'text/csv'],
};

const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png':  ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
  'text/csv':   ['.csv'],
};

export function createUploadMiddleware(type: keyof typeof ALLOWED_MIME_TYPES) {
  return multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 10 * 1024 * 1024 },    // 10 MB
    fileFilter: (req, file, cb) => {
      const allowed = ALLOWED_MIME_TYPES[type];
      if (!allowed.includes(file.mimetype)) {
        return cb(new ValidationError(`File type not allowed. Allowed: ${allowed.join(', ')}`));
      }

      const ext = path.extname(file.originalname).toLowerCase();
      const validExts = ALLOWED_EXTENSIONS[file.mimetype] ?? [];
      if (!validExts.includes(ext)) {
        return cb(new ValidationError(`File extension does not match type`));
      }

      cb(null, true);
    },
  });
}
```

---

## SQL injection prevention — Prisma is safe by default

```typescript
// Prisma uses parameterized queries — never string-interpolate into queries

// ❌ NEVER do this (raw SQL with interpolation)
const users = await prisma.$queryRaw`SELECT * FROM users WHERE email = '${email}'`;

// ✅ CORRECT — parameterized raw query
const users = await prisma.$queryRaw`SELECT * FROM users WHERE email = ${email}`;

// ✅ BEST — use Prisma's ORM layer (safest)
const users = await prisma.user.findMany({ where: { email } });

// ✅ If you must use raw queries, use Prisma.sql tagged template
import { Prisma } from '@prisma/client';
const result = await prisma.$queryRaw(
  Prisma.sql`SELECT id, email FROM users WHERE organizationId = ${orgId} LIMIT ${limit}`
);
```

---

## Frontend — DOMPurify for user-generated content

```typescript
// frontend/src/utils/sanitize.ts
import DOMPurify from 'dompurify';

const PURIFY_CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS:  ['p', 'b', 'i', 'u', 'strong', 'em', 'ul', 'ol', 'li', 'br', 'a'],
  ALLOWED_ATTR:  ['href', 'target', 'rel'],
  FORBID_SCRIPTS: true,
  ADD_ATTR: ['target'],
};

// Force external links to open safely
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, PURIFY_CONFIG);
}

// Safe HTML renderer component:
export function SafeHtml({ html, className }: { html: string; className?: string }) {
  const clean = sanitizeHtml(html);
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}

// NEVER render user content without sanitization:
// ❌ <div dangerouslySetInnerHTML={{ __html: userContent }} />
// ✅ <SafeHtml html={userContent} />
```

---

## URL validation — prevent javascript: and data: URIs

```typescript
// Validate URLs before using them in <a href> or redirects
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// Zod schema for URLs:
const SafeUrlSchema = z.string().url().refine(
  url => isSafeUrl(url),
  { message: 'Only http/https URLs are allowed' },
);

// Safe redirect — never redirect to arbitrary URLs from query params
export function safeRedirect(url: string, defaultPath = '/dashboard'): string {
  if (!url || !url.startsWith('/') || url.startsWith('//')) return defaultPath;
  return url;
}

// Usage in login redirect:
const redirectTo = safeRedirect(req.query.redirect as string);
res.redirect(redirectTo);
```

---

## Content Security Policy headers

```typescript
// backend/src/middleware/security.ts
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],          // no inline scripts
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc:     ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.API_URL ?? ''],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      objectSrc:  ["'none'"],
      frameSrc:   ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,    // required for some PWA features
}));
```

---

## Checklist

- [ ] All string inputs trimmed and length-limited in Zod schema before reaching service
- [ ] Rich text fields sanitized with DOMPurify (backend: jsdom, frontend: browser DOMPurify)
- [ ] File names sanitized via `sanitizeFileName()` — never used directly in filesystem paths
- [ ] Stored file names are random hex — never the original uploaded name
- [ ] Both MIME type AND file extension validated on upload
- [ ] Prisma ORM used for all DB queries — no string interpolation in `$queryRaw`
- [ ] `SafeHtml` component used for all user-generated HTML — never raw `dangerouslySetInnerHTML`
- [ ] External links have `rel="noopener noreferrer"` and `target="_blank"`
- [ ] `safeRedirect()` used for all redirect-after-login flows
- [ ] Helmet CSP configured — `script-src` does not include `'unsafe-inline'`
