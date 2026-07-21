import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from './encryption.js';

describe('encryption — versioned AES-256-GCM', () => {
  it('round-trips plaintext', () => {
    const c = encrypt('super-secret-rtsp-password');
    expect(decrypt(c)).toBe('super-secret-rtsp-password');
  });

  it('stamps the active key version on new ciphertext', () => {
    expect(encrypt('x').startsWith('v1:')).toBe(true);
  });

  it('uses a fresh IV per call (ciphertext is non-deterministic)', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'));
  });

  it('decrypts legacy unversioned ciphertext with the primary key (dual-read)', () => {
    const c = encrypt('legacy-value');
    const unversioned = c.slice(c.indexOf(':') + 1); // strip the "v1:" prefix
    expect(decrypt(unversioned)).toBe('legacy-value');
  });

  it('throws on tampered ciphertext (GCM auth failure)', () => {
    const c = encrypt('tamper-me');
    const buf = Buffer.from(c.slice(3), 'base64');
    buf[buf.length - 1] ^= 0xff; // flip a ciphertext byte
    expect(() => decrypt(`v1:${buf.toString('base64')}`)).toThrow();
  });
});
