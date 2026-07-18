# Skill — Encryption & Sensitive-Data Patterns (AES-256-GCM for camera/router credentials)

---

Field-level encryption for **camera and router credentials at rest**: RTSP passwords, ONVIF passwords,
router admin passwords, and SIM PINs. `ENCRYPTION_KEY` must already exist in boilerplate — do not add a
second encryption scheme. Reference: `docs/02-TRD.md` §"credential storage".

## Encryption utility (already exists — apps/api/src/common/utils/encryption.ts)

```typescript
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes / 64 hex chars — checked at bootstrap

export function encrypt(plainText: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Store iv:authTag:ciphertext as one string — all three are required to decrypt
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, dataHex] = ciphertext.split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Malformed ciphertext');
  const decipher = createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

// Safe decrypt: NEVER let a corrupted/tampered row 500 a list endpoint — surface a redacted placeholder
export function safeDecrypt(ciphertext: string | null): string | null {
  if (!ciphertext) return null;
  try {
    return decrypt(ciphertext);
  } catch {
    return null; // caller renders "•••• unavailable" instead of leaking a stack trace
  }
}
```

## Which fields get encrypted (naming convention: must end in `Encrypted`)

```prisma
// docs/05-backend-schema.md — Camera / Router models
model Camera {
  id                       String  @id @default(uuid())
  organizationId           String
  rtspUrl                  String  // host/path only — never embed credentials in the URL
  rtspUsername             String?
  rtspPasswordEncrypted    String? // AES-256-GCM, iv:authTag:ciphertext
  onvifUsername            String?
  onvifPasswordEncrypted   String? // AES-256-GCM
}

model Router {
  id                        String  @id @default(uuid())
  organizationId            String
  adminUsername             String
  adminPasswordEncrypted    String  // AES-256-GCM
  simPinEncrypted           String? // AES-256-GCM
}
```

## On save / on read

```typescript
// apps/api/src/modules/cameras/cameras.service.ts
async create(actor: AuthUser, dto: CreateCameraInput) {
  return this.prisma.camera.create({
    data: {
      organizationId: actor.organizationId,
      rtspUrl: dto.rtspUrl,
      rtspUsername: dto.rtspUsername,
      rtspPasswordEncrypted: dto.rtspPassword ? encrypt(dto.rtspPassword) : null, // field name ends in Encrypted
      onvifUsername: dto.onvifUsername,
      onvifPasswordEncrypted: dto.onvifPassword ? encrypt(dto.onvifPassword) : null,
    },
  });
}

// Only PROJECT_ADMIN/SUPER_ADMIN reach this — see skill-rbac-advanced-patterns.md's cameraCredentials rows
async getDecryptedCredentials(actor: AuthUser, id: string) {
  const camera = await this.prisma.camera.findFirst({ where: { id, organizationId: actor.organizationId } });
  if (!camera) throw new NotFoundException('Camera not found');
  await this.auditLogger.log({ action: 'CAMERA_CREDENTIALS_VIEWED', actorId: actor.id, entityId: id });
  return {
    rtspPassword: safeDecrypt(camera.rtspPasswordEncrypted),
    onvifPassword: safeDecrypt(camera.onvifPasswordEncrypted),
  };
}
```

## Encrypted values are never returned in list endpoints

```typescript
// ✅ CORRECT — strip *Encrypted fields from the list/read DTO; only the single-credential endpoint decrypts
function toCameraResponse(camera: Camera): CameraResponse {
  const { rtspPasswordEncrypted, onvifPasswordEncrypted, ...safe } = camera;
  return { ...safe, hasCredentials: Boolean(rtspPasswordEncrypted || onvifPasswordEncrypted) };
}
```

## Searchable hash for exact-match lookups (e.g. router MAC / SIM ICCID dedupe)

```typescript
// SHA-256 + pepper — deterministic, so it CAN be indexed and queried, unlike AES-256-GCM (random IV per call)
const HASH_PEPPER = process.env.HASH_PEPPER!;
function searchHash(value: string): string {
  return createHash('sha256').update(value + HASH_PEPPER).digest('hex');
}

// Router.simIccidHash is a unique-indexed column alongside Router.simIccidEncrypted
async findBySimIccid(iccid: string) {
  return this.prisma.router.findFirst({ where: { simIccidHash: searchHash(iccid) } });
}
```

## Key rotation (ENCRYPTION_KEY rollover, dual-key window)

```typescript
// Run once during a planned rotation — decrypt every *Encrypted column with OLD_ENCRYPTION_KEY,
// re-encrypt with NEW_ENCRYPTION_KEY, verified in a staging restore before promoting NEW → ENCRYPTION_KEY.
const OLD_KEY = Buffer.from(process.env.OLD_ENCRYPTION_KEY!, 'hex');
const NEW_KEY = Buffer.from(process.env.NEW_ENCRYPTION_KEY!, 'hex');

async function rotateEncryptionKey(prisma: PrismaClient) {
  const cameras = await prisma.camera.findMany({ where: { rtspPasswordEncrypted: { not: null } } });
  for (const camera of cameras) {
    const plain = decryptWithKey(camera.rtspPasswordEncrypted!, OLD_KEY);
    const reEncrypted = encryptWithKey(plain, NEW_KEY);
    await prisma.camera.update({ where: { id: camera.id }, data: { rtspPasswordEncrypted: reEncrypted } });
  }
}
```

## Rules

1. Any DB column holding a plaintext credential (RTSP/ONVIF/router admin password, SIM PIN) is a bug — it
   must be `*Encrypted` and go through `encrypt()`/`decrypt()`.
2. Decryption failures never 500 a list/dashboard endpoint — use `safeDecrypt()` and show a redacted
   placeholder; only the dedicated single-camera credentials endpoint may throw.
3. `getDecryptedCredentials` is always audit-logged (`CAMERA_CREDENTIALS_VIEWED` / `ROUTER_CREDENTIALS_VIEWED`)
   — see `skill-audit-log-patterns.md`.
4. `ENCRYPTION_KEY` (and `OLD_/NEW_ENCRYPTION_KEY` during rotation) are read once at bootstrap and never
   logged, never included in error messages, never sent to the frontend.