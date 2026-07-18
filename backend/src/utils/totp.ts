import crypto from 'node:crypto';

// RFC 6238 TOTP implemented with node:crypto only — no external dependency.
// Used for admin MFA (SUPER_ADMIN / PROJECT_ADMIN) per docs/06-implementation-plan.md Stage 1.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return code.toString().padStart(digits, '0');
}

/** 20 random bytes, base32-encoded — standard authenticator-app secret length. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/** Verifies a 6-digit TOTP code with ±`window` steps of clock drift tolerance. */
export function verifyTotp(
  secretBase32: string,
  code: string,
  window = 1,
  stepSeconds = 30
): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  let secret: Buffer;
  try {
    secret = base32Decode(secretBase32);
  } catch {
    return false;
  }
  const counter = Math.floor(Date.now() / 1000 / stepSeconds);
  let ok = false;
  for (let i = -window; i <= window; i++) {
    const expected = hotp(secret, counter + i);
    // Constant-time compare; do not early-return so timing is uniform across the window.
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code))) ok = true;
  }
  return ok;
}

/** otpauth:// URL for QR-code enrollment in authenticator apps. */
export function otpauthUrl(
  accountEmail: string,
  secretBase32: string,
  issuer = 'Aniston VMS'
): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
