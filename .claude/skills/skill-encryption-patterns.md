# Skill — Encryption & Sensitive Data Patterns

AES-256-GCM for field encryption, which fields to encrypt, how to search encrypted data.

---

## Encryption utility (already in boilerplate)

```typescript
// backend/src/utils/encryption.ts — already exists
import crypto from 'crypto';

const ALGORITHM  = 'aes-256-gcm';
const KEY_HEX    = process.env.ENCRYPTION_KEY!;   // 64 hex chars = 32 bytes
const KEY        = Buffer.from(KEY_HEX, 'hex');

if (KEY.length !== 32) {
  throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
}

export function encrypt(plaintext: string): string {
  const iv         = crypto.randomBytes(12);                   // 96-bit IV for GCM
  const cipher     = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag    = cipher.getAuthTag();                      // 128-bit auth tag (tamper detection)

  // Format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, dataHex] = ciphertext.split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Invalid ciphertext format');

  const iv       = Buffer.from(ivHex, 'hex');
  const authTag  = Buffer.from(tagHex, 'hex');
  const data     = Buffer.from(dataHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

// Safe decrypt — returns null if decryption fails (corrupted or tampered)
export function safeDecrypt(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null;
  try { return decrypt(ciphertext); }
  catch { return null; }
}
```

---

## Which fields MUST be encrypted

| Field | Why |
|-------|-----|
| Bank account / card number | Financial PII |
| National ID / SSN | Government ID |
| Passport number | Government ID |
| API key / access token | Credential |
| Third-party integration secret | Credential |
| Personal contact details | PII |

**Field naming convention:** always suffix with `Encrypted`

```prisma
model Item {
  id                 String  @id @default(uuid())
  // ... standard fields (organizationId, createdAt, updatedAt, deletedAt)

  // Plain text — searchable, not sensitive
  name               String
  description        String?
  createdById        String        // owner — used for ownership-scoped access

  // Encrypted — sensitive data
  secretEncrypted    String?
  apiKeyEncrypted    String?
}
```

---

## Service — encrypt on write, decrypt on read

```typescript
import { encrypt, safeDecrypt } from '../../utils/encryption.js';

export class ItemService {
  static async create(dto: CreateItemInput, actor: AuthUser) {
    return prisma.$transaction(async (tx) => {
      const item = await tx.item.create({
        data: {
          ...dto,
          organizationId: actor.organizationId,
          // Encrypt sensitive fields before storing
          secretEncrypted: dto.secret ? encrypt(dto.secret) : null,
          apiKeyEncrypted: dto.apiKey ? encrypt(dto.apiKey) : null,
          // Remove plain text from the stored object
          secret: undefined,
          apiKey: undefined,
        },
      });
      return item;
    });
  }

  // ── Decrypt for response ─────────────────────────────────────────────────
  static decryptItem(item: ItemWithEncrypted): ItemResponse {
    return {
      ...item,
      // Expose decrypted fields under their plain names
      secret: safeDecrypt(item.secretEncrypted),
      apiKey: safeDecrypt(item.apiKeyEncrypted),
      // Remove encrypted versions from the response
      secretEncrypted: undefined,
      apiKeyEncrypted: undefined,
    };
  }

  static async getOne(id: string, actor: AuthUser) {
    const item = await prisma.item.findFirst({
      where: { id, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!item) throw new NotFoundError('Item not found');
    return this.decryptItem(item);
  }
}
```

---

## Role-based field exposure — only privileged roles see sensitive data

```typescript
// Limit sensitive-data visibility by role
static async getOne(id: string, actor: AuthUser) {
  const item = await prisma.item.findFirst({
    where: { id, organizationId: actor.organizationId, deletedAt: null },
  });
  if (!item) throw new NotFoundError('Item not found');

  const base = this.decryptItem(item);

  // A restricted role (MEMBER) gets a redacted view of records it does not own
  if (actor.role === UserRole.MEMBER && item.createdById !== actor.id) {
    return {
      id:          base.id,
      name:        base.name,
      description: base.description,
      // Sensitive fields omitted entirely
    };
  }

  return base;
}
```

---

## Searching encrypted data — strategies

AES-GCM ciphertext is non-deterministic (different each time), so you CANNOT do `WHERE secretEncrypted LIKE '%..%'`.

### Strategy 1 — Searchable hash (for exact match)

```typescript
// Store a SHA-256 hash alongside the encrypted value for exact-match search
const secretHash = crypto.createHash('sha256')
  .update(dto.secret + process.env.HASH_PEPPER)  // add pepper to prevent rainbow tables
  .digest('hex');

await tx.item.create({
  data: {
    secretEncrypted: encrypt(dto.secret),
    secretHash,      // searchable — add @@index([secretHash])
  },
});

// Search by exact secret value:
const hash = crypto.createHash('sha256').update(searchSecret + HASH_PEPPER).digest('hex');
const item = await prisma.item.findFirst({ where: { secretHash: hash, organizationId } });
```

### Strategy 2 — Search by non-encrypted fields only

For most searches: search by name, description, item ID. Never offer full sensitive-data search in the UI.

### Strategy 3 — Decrypt in application for admin operations

For admin bulk export: fetch all records, decrypt in the service, format report. Never SQL-search decrypted values.

---

## Key rotation procedure

```typescript
// When ENCRYPTION_KEY changes, re-encrypt all existing records
// Run as a one-time migration script — NOT in the API server

async function rotateEncryptionKey() {
  const OLD_KEY = Buffer.from(process.env.OLD_ENCRYPTION_KEY!, 'hex');
  const NEW_KEY = Buffer.from(process.env.NEW_ENCRYPTION_KEY!, 'hex');

  const items = await prisma.item.findMany({ where: { secretEncrypted: { not: null } } });

  for (const item of items) {
    // Decrypt with old key
    const plain = decryptWithKey(item.secretEncrypted!, OLD_KEY);
    // Re-encrypt with new key
    const reEncrypted = encryptWithKey(plain, NEW_KEY);
    await prisma.item.update({ where: { id: item.id }, data: { secretEncrypted: reEncrypted } });
  }

  console.log(`Rotated ${items.length} records`);
}
```

---

## Checklist

- [ ] `ENCRYPTION_KEY` is 64 hex chars (32 bytes) — validated on server start
- [ ] All sensitive field names end in `Encrypted` in Prisma schema
- [ ] `encrypt()` called on all sensitive fields BEFORE `prisma.create/update`
- [ ] `safeDecrypt()` used on all reads (not `decrypt()`) — handles corrupted data gracefully
- [ ] Encrypted ciphertext strings NEVER returned in API responses — always decrypted or omitted
- [ ] Role check before exposing sensitive data — a MEMBER cannot see records it does not own
- [ ] Searchable fields use SHA-256 hash with pepper, not the ciphertext
- [ ] Key rotation script exists and is tested in staging before production
- [ ] `ENCRYPTION_KEY` in GitHub secrets — never in `.env` committed to git
