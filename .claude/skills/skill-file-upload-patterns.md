# Skill — File Upload Patterns

Nest `FileInterceptor` / `FilesInterceptor` → validate (mimetype + size) → push the buffer to MinIO/S3 → persist the object key in Postgres via Prisma → hand back a short-lived signed URL. Complete pattern for camera reference-image uploads (single baseline shot + batch of angle shots) in Aniston VMS.

See `docs/05-backend-schema.md` (§`ReferenceImage`) and `docs/03-app-flow.md` for the full upload → scene-shift-baseline flow this feeds; the object-key layout below mirrors the recording layout documented in `memory/alignment-dictionary.md` (`/{org}/{site}/{camera}/{YYYY}/{MM}/{DD}/{HH-mm-ss}-...`).

> Note on file typing: multer's uploaded-file shape ships as a global ambient type tied to the HTTP adapter's request types, and its exact name differs across Nest's supported HTTP adapters (`@nestjs/platform-express` vs. the Fastify multipart equivalent). To keep these snippets adapter-agnostic we alias it locally as `MulterFile`.

```typescript
// shared shape, define once in apps/api/src/common/types/multer-file.ts
export type MulterFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};
```

---

## Backend — Storage service (MinIO/S3 client, one instance for the whole API)

```typescript
// apps/api/src/storage/storage.service.ts
import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private readonly bucket = process.env.S3_BUCKET!;
  private readonly client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,        // MinIO in dev/staging, AWS S3 in prod
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,                     // required for MinIO-style path buckets
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
  });

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }
}
```

---

## Backend — Upload validation config (Nest interceptor options, not raw multer middleware)

```typescript
// apps/api/src/modules/cameras/reference-images/reference-image-upload.config.ts
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';
import { ValidationError } from '../../../common/errors/domain-errors';
import type { MulterFile } from '../../../common/types/multer-file';

export const ALLOWED_IMAGES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_SIZE_MB = 5;

export const referenceImageUploadOptions: MulterOptions = {
  storage: memoryStorage(),   // buffer only — never touches local disk, we push straight to MinIO/S3
  limits: { fileSize: MAX_IMAGE_SIZE_MB * 1024 * 1024, files: 5 },
  fileFilter: (_req, file: MulterFile, cb) => {
    if (!ALLOWED_IMAGES.includes(file.mimetype)) {
      return cb(new ValidationError(`Only ${ALLOWED_IMAGES.join(', ')} allowed`), false);
    }
    cb(null, true);
  },
};
```

---

## Controller — single + batch reference-image upload routes

```typescript
// apps/api/src/modules/cameras/reference-images/reference-images.controller.ts
import { Controller, Post, Get, Param, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ScopeGuard } from '../../auth/guards/scope.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequestScope } from '../../auth/decorators/request-scope.decorator';
import { Role, type AccessScope } from '@aniston-vms/shared';
import type { MulterFile } from '../../../common/types/multer-file';
import { ReferenceImagesService } from './reference-images.service';
import { referenceImageUploadOptions } from './reference-image-upload.config';

@UseGuards(JwtAuthGuard, ScopeGuard)
@Controller('cameras/:cameraId/reference-images')
export class ReferenceImagesController {
  constructor(private readonly referenceImages: ReferenceImagesService) {}

  // Single file — sets a new scene-shift baseline for the camera
  @Post()
  @Roles(Role.ENGINEER, Role.PROJECT_ADMIN, Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file', referenceImageUploadOptions))
  upload(
    @Param('cameraId') cameraId: string,
    @UploadedFile() file: MulterFile,
    @RequestScope() scope: AccessScope,
  ) {
    return this.referenceImages.upload(cameraId, file, scope);
  }

  // Multiple files — several angle shots captured in the same site visit
  @Post('batch')
  @Roles(Role.ENGINEER, Role.PROJECT_ADMIN, Role.SUPER_ADMIN)
  @UseInterceptors(FilesInterceptor('files', 5, referenceImageUploadOptions))
  uploadBatch(
    @Param('cameraId') cameraId: string,
    @UploadedFiles() files: MulterFile[],
    @RequestScope() scope: AccessScope,
  ) {
    return this.referenceImages.uploadBatch(cameraId, files, scope);
  }

  // Read access is broader than write access — viewers can see the baseline, not set it
  @Get(':referenceImageId/download-url')
  @Roles(Role.OPERATOR, Role.ENGINEER, Role.PROJECT_ADMIN, Role.SUPER_ADMIN, Role.CLIENT_VIEWER)
  getDownloadUrl(
    @Param('cameraId') cameraId: string,
    @Param('referenceImageId') referenceImageId: string,
    @RequestScope() scope: AccessScope,
  ) {
    return this.referenceImages.getSignedUrl(cameraId, referenceImageId, scope);
  }
}
```

---

## Service — validate scope, push to storage, persist via Prisma

```typescript
// apps/api/src/modules/cameras/reference-images/reference-images.service.ts
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { StorageService } from '../../../storage/storage.service';
import { AuditLogger } from '../../../common/audit-logger';
import { NotFoundError } from '../../../common/errors/domain-errors';
import type { MulterFile } from '../../../common/types/multer-file';
import type { AccessScope } from '@aniston-vms/shared';

@Injectable()
export class ReferenceImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auditLogger: AuditLogger,
  ) {}

  async upload(cameraId: string, file: MulterFile, scope: AccessScope) {
    const camera = await this.getCameraInScope(cameraId, scope);
    const s3Key = this.buildKey(camera.id, file);
    await this.storage.putObject(s3Key, file.buffer, file.mimetype);

    return this.prisma.$transaction(async (tx) => {
      const referenceImage = await tx.referenceImage.create({
        data: { cameraId, s3Key, approvedById: scope.userId, approvedAt: new Date() },
      });
      await this.auditLogger.log(tx, {
        action: 'REFERENCE_IMAGE_UPLOADED',
        entityId: referenceImage.id,
        actorId: scope.userId,
        organizationId: scope.organizationId,
      });
      return referenceImage;
    });
  }

  async uploadBatch(cameraId: string, files: MulterFile[], scope: AccessScope) {
    const camera = await this.getCameraInScope(cameraId, scope);

    const rows = await Promise.all(
      files.map(async (file) => {
        const s3Key = this.buildKey(camera.id, file);
        await this.storage.putObject(s3Key, file.buffer, file.mimetype);
        return { cameraId, s3Key, approvedById: scope.userId, approvedAt: new Date() };
      }),
    );

    // createMany — no per-row audit trail here; log the batch once instead
    const created = await this.prisma.referenceImage.createMany({ data: rows });
    await this.auditLogger.log(this.prisma, {
      action: 'REFERENCE_IMAGE_BATCH_UPLOADED',
      entityId: cameraId,
      actorId: scope.userId,
      organizationId: scope.organizationId,
    });
    return created;
  }

  async getSignedUrl(cameraId: string, referenceImageId: string, scope: AccessScope) {
    await this.getCameraInScope(cameraId, scope);
    const referenceImage = await this.prisma.referenceImage.findFirst({
      where: { id: referenceImageId, cameraId },
    });
    if (!referenceImage) throw new NotFoundError('Reference image not found');
    return { url: await this.storage.getSignedDownloadUrl(referenceImage.s3Key) };
  }

  private async getCameraInScope(cameraId: string, scope: AccessScope) {
    const camera = await this.prisma.camera.findFirst({
      where: { id: cameraId, zoneId: { in: scope.allowedZoneIds } },
    });
    if (!camera) throw new NotFoundError('Camera not found');
    return camera;
  }

  private buildKey(cameraId: string, file: MulterFile): string {
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? 'jpg';
    // Mirrors the recording key layout from memory/alignment-dictionary.md,
    // scoped under a `reference/` prefix instead of the recording date tree.
    return `${cameraId}/reference/${stamp}-${randomUUID()}.${ext}`;
  }
}
```

---

## Serve uploads securely (signed URLs only — never a public bucket)

```typescript
// ❌ WRONG — public bucket / public object ACL, anyone with the key can fetch it forever
//   this.storage returns a bare `https://bucket.s3.../key` URL with no expiry and no auth check

// ❌ WRONG — mounting the bucket behind a static route, same problem as a public bucket
//   app.use('/reference-images', express.static(...))   // don't do this, in any framework

// ✅ CORRECT — scope check, then a presigned URL that expires in minutes
async getSignedUrl(cameraId: string, referenceImageId: string, scope: AccessScope) {
  await this.getCameraInScope(cameraId, scope);   // 404s if the camera isn't in the caller's zones
  const referenceImage = await this.prisma.referenceImage.findFirst({
    where: { id: referenceImageId, cameraId },
  });
  if (!referenceImage) throw new NotFoundError('Reference image not found');
  return { url: await this.storage.getSignedDownloadUrl(referenceImage.s3Key, 300) }; // 5 min TTL
}
```

---

## Prisma model — reference image store (`docs/05-backend-schema.md`)

```prisma
model ReferenceImage {
  id           String   @id @default(uuid())
  cameraId     String   @map("camera_id")
  s3Key        String   @map("s3_key")
  approvedById String   @map("approved_by")
  approvedAt   DateTime @map("approved_at")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  camera     Camera @relation(fields: [cameraId], references: [id])
  approvedBy User   @relation(fields: [approvedById], references: [id], onDelete: Restrict)

  @@map("reference_images")
}
```

There is deliberately no `deletedAt` on this model — scene-shift detection (`Snapshot.sceneShiftScore`) compares each new capture against the camera's reference-image history, so older baselines are kept, not deleted. Don't bolt on a delete endpoint or extra columns (e.g. `mimeType`/`sizeBytes`) without a real migration and an update to `docs/05-backend-schema.md` first.

---

## Frontend — upload with preview

```typescript
// frontend/src/features/cameras/ReferenceImageUpload.tsx
import { useRef, useState } from 'react';
import { useUploadReferenceImageMutation } from './cameras.api';
import { toast } from '@/hooks/useToast';

export function ReferenceImageUpload({ cameraId, currentImageUrl }: { cameraId: string; currentImageUrl?: string }) {
  const [preview, setPreview] = useState<string | null>(currentImageUrl ?? null);
  const [upload, { isLoading }] = useUploadReferenceImageMutation();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation before sending — still re-validated server-side
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Only JPEG, PNG, and WebP images allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }

    // Show local preview immediately (UX improvement)
    setPreview(URL.createObjectURL(file));

    const formData = new FormData();
    formData.append('file', file);

    try {
      await upload({ cameraId, formData }).unwrap();
      toast.success('Reference image updated');
    } catch {
      toast.error('Failed to upload reference image');
      setPreview(currentImageUrl ?? null);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative w-24 h-24 rounded-full overflow-hidden bg-[var(--ui-background-color)] cursor-pointer"
        onClick={() => inputRef.current?.click()}
      >
        {preview
          ? <img src={preview} alt="Camera reference baseline" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-[var(--secondary-text-color)]">📷</div>
        }
        {isLoading && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><span className="text-white animate-spin">⟳</span></div>}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
      <button className="btn btn--secondary btn--sm" onClick={() => inputRef.current?.click()} disabled={isLoading}>
        Update reference image
      </button>
    </div>
  );
}
```

---

## RTK Query — file upload mutation

```typescript
// frontend/src/features/cameras/cameras.api.ts (excerpt)
uploadReferenceImage: builder.mutation<ReferenceImage, { cameraId: string; formData: FormData }>({
  query: ({ cameraId, formData }) => ({
    url: `/cameras/${cameraId}/reference-images`,
    method: 'POST',
    body: formData,
    // Do NOT set Content-Type — let the browser set multipart/form-data with the boundary
    formData: true,
  }),
  invalidatesTags: (_result, _error, { cameraId }) => [{ type: 'Camera', id: cameraId }],
}),
```

---

## Checklist

- [ ] MIME type validated server-side in `fileFilter` (client-side check is UX only — never trust it)
- [ ] File size limited via interceptor `limits.fileSize` (server-side), not just the `<input>` check
- [ ] `FilesInterceptor(field, maxCount, opts)` always has a `maxCount` to prevent a DoS via file-count
- [ ] `memoryStorage()`, not `diskStorage()` — the API runs as stateless replicas; nothing survives on local disk between requests, so buffers go straight to MinIO/S3
- [ ] S3 key is randomized (`randomUUID()` + timestamp), never derived from `file.originalname` directly
- [ ] Bucket is private; downloads only ever go through `StorageService.getSignedDownloadUrl` with a short TTL, never a public object URL or a static file mount
- [ ] Every upload/approval writes an `AuditLogger` entry (`REFERENCE_IMAGE_UPLOADED` / `..._BATCH_UPLOADED`)
- [ ] Scope-checked before touching storage: `getCameraInScope` 404s (not 403 — don't leak existence) for cameras outside `scope.allowedZoneIds`
- [ ] Don't add columns or a delete route to `ReferenceImage` without updating `docs/05-backend-schema.md` first — the model's shape is the documented contract, not a suggestion
- [ ] Client shows a local preview immediately via `URL.createObjectURL`, then reconciles with the server response
