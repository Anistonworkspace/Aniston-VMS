# Skill — Input Sanitization & Stream-Input Validation Patterns

---

Backend: class-validator DTOs + a strict RTSP/ONVIF URL allow-list are the primary defense — sanitize
**before** a value ever reaches `ffmpeg`/MediaMTX or a database query. Frontend: DOMPurify for any
user-authored rich text (incident notes, maintenance comments), safe file-upload handling for evidence
photos/clips. Reference: `docs/02-TRD.md` §"stream ingestion" and §"file uploads".

## RTSP / ONVIF connection input validation (highest-risk surface — feeds ffmpeg/MediaMTX)

```typescript
// packages/shared/src/dto/create-camera.dto.ts
const RTSP_URL_PATTERN = /^rtsp:\/\/[a-zA-Z0-9.\-]+(:\d{1,5})?\/[\w\-./]*$/;

export class CreateCameraDto {
  @IsString()
  @Matches(RTSP_URL_PATTERN, { message: 'INVALID_STREAM_PATH' })
  // ✅ Scheme is pinned to rtsp:// — reject rtsp+shell/file:/javascript:/data: and anything with
  // shell metacharacters (; | & $ ` \n) that could reach an ffmpeg subprocess via string interpolation.
  rtspUrl!: string;

  @IsOptional() @IsString() @MaxLength(128) @Matches(/^[^\s'"$`;|&\n]*$/)
  rtspUsername?: string;

  @IsOptional() @IsIP()
  onvifHost?: string; // parsed/validated as an IP — never string-concatenated into a shell command

  @IsOptional() @IsInt() @Min(1) @Max(65535)
  onvifPort?: number;
}
```

```typescript
// apps/api/src/modules/cameras/cameras.service.ts
// ✅ CORRECT — ffmpeg/MediaMTX args passed as an argv array, NEVER as an interpolated shell string
spawn('ffmpeg', ['-rtsp_transport', 'tcp', '-i', camera.rtspUrl, '-f', 'null', '-']);
// ❌ NEVER: exec(`ffmpeg -i ${camera.rtspUrl} ...`)  — a crafted rtspUrl becomes a command-injection vector
```

```typescript
// Defense in depth: re-validate again in the service (DTO validation can be bypassed by internal callers,
// e.g. a BullMQ health-check job re-reading the row from Prisma).
function assertSafeRtspUrl(url: string) {
  if (!RTSP_URL_PATTERN.test(url)) throw new BadRequestException('INVALID_STREAM_PATH');
}
```

## SQL injection — Prisma parameterizes everything, but raw queries still need care

```typescript
// ✅ CORRECT — Prisma's query builder is safe by construction
await this.prisma.camera.findMany({ where: { rtspUrl: { contains: userSearchTerm } } });

// ✅ CORRECT — $queryRaw with tagged-template params is parameterized
await this.prisma.$queryRaw`SELECT * FROM "Camera" WHERE "zoneId" = ${zoneId}`;

// ❌ NEVER — string-built raw SQL
await this.prisma.$queryRawUnsafe(`SELECT * FROM "Camera" WHERE "zoneId" = '${zoneId}'`);
```

## Rich text sanitization (incident notes, maintenance task comments)

```typescript
// frontend/src/utils/sanitize.ts
import createDOMPurify from 'dompurify';
const DOMPurify = createDOMPurify(window);

const ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'a'];
const ALLOWED_ATTRS = ['href'];

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS, ALLOWED_ATTRS, FORBID_SCRIPTS: true });
}

// ✅ CORRECT — sanitize on write (server) AND render with dangerouslySetInnerHTML only after sanitizing
<div dangerouslySetInnerHTML={{ __html: sanitizeHtml(incident.notes) }} />
```

```typescript
// apps/api/src/modules/incidents/dto/create-incident.dto.ts — plain-text fields never allow markup at all
export class CreateIncidentNoteDto {
  @IsString() @MaxLength(2000)
  @Transform(({ value }) => sanitizeHtml(value)) // server-side sanitize before persisting, don't trust the client
  notes!: string;
}
```

## Evidence file uploads (snapshots, incident evidence photos, exported clips)

```typescript
// apps/api/src/modules/incidents/upload.config.ts
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'video/mp4'];
export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.mp4'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — clip exports are larger than snapshots

export const evidenceUploadOptions: MulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype) || !ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new BadRequestException('UNSUPPORTED_FILE_TYPE'), false);
    }
    cb(null, true);
  },
};

// Never trust file.originalname for the stored path — regenerate it
function generateStoredFileName(originalName: string): string {
  const ext = extname(originalName).toLowerCase();
  return `${randomBytes(16).toString('hex')}${ext}`;
}
```

## CSP + security headers (apps/api/src/main.ts via helmet)

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],          // camera snapshots render as blob: URLs
      mediaSrc: ["'self'", 'blob:'],                  // HLS/WebRTC playback via MediaMTX
      connectSrc: ["'self'", process.env.MEDIAMTX_WS_URL ?? ''],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // relaxed for the video player's worker/wasm decoder
}));
```

## Rules

1. RTSP/ONVIF host, port, username, and stream path are validated against a strict allow-list pattern
   at the DTO layer AND re-checked in the service before being passed to `ffmpeg`/MediaMTX — always as an
   argv array, never an interpolated shell string.
2. Every Prisma query is parameterized by construction; `$queryRawUnsafe` / string-built SQL is banned in
   review.
3. Any field rendered as HTML (incident notes, maintenance comments) is sanitized server-side on write
   with a fixed `ALLOWED_TAGS`/`ALLOWED_ATTRS` allow-list — never rendered raw.
4. Evidence uploads (snapshots/clips) are validated by MIME type + extension + size, stored under a
   regenerated random filename, never the client-supplied `originalname`.
5. CSP is enabled by `helmet` on every environment, including local dev, so a missing directive is caught
   before it ships.