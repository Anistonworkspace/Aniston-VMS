import { describe, it, expect } from 'vitest';
import { envSchema } from './env.js';

// A clean production env: sim/mock/drill modes explicitly OFF, real secrets.
const base = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@db:5432/vms',
  JWT_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  ENCRYPTION_KEY: 'a'.repeat(64),
  MEDIA_URL_SIGNING_SECRET: 'c'.repeat(40),
  HEALTH_SIM_MODE: 'false',
  PLAYBACK_SIM_MODE: 'false',
  ALERT_MOCK_MODE: 'false',
  DRILL_MODE: 'false',
};

describe('env production guards', () => {
  it('accepts a clean production env', () => {
    expect(envSchema.safeParse(base).success).toBe(true);
  });

  it.each(['HEALTH_SIM_MODE', 'PLAYBACK_SIM_MODE', 'ALERT_MOCK_MODE', 'DRILL_MODE'])(
    'rejects %s=true in production',
    (flag) => {
      expect(envSchema.safeParse({ ...base, [flag]: 'true' }).success).toBe(false);
    }
  );

  it('requires JWT_REFRESH_SECRET in production', () => {
    const { JWT_REFRESH_SECRET, ...noRefresh } = base;
    void JWT_REFRESH_SECRET;
    expect(envSchema.safeParse(noRefresh).success).toBe(false);
  });

  it('requires MEDIA_URL_SIGNING_SECRET in production', () => {
    const { MEDIA_URL_SIGNING_SECRET, ...noMedia } = base;
    void MEDIA_URL_SIGNING_SECRET;
    expect(envSchema.safeParse(noMedia).success).toBe(false);
  });

  it('rejects a non-https MEDIA_PUBLIC_BASE_URL in production', () => {
    expect(
      envSchema.safeParse({ ...base, MEDIA_PUBLIC_BASE_URL: 'http://media.example.com' }).success
    ).toBe(false);
  });

  it('rejects a localhost MEDIA_PUBLIC_BASE_URL in production', () => {
    expect(
      envSchema.safeParse({ ...base, MEDIA_PUBLIC_BASE_URL: 'https://localhost:8888' }).success
    ).toBe(false);
  });

  it('accepts same-origin (empty) or https MEDIA_PUBLIC_BASE_URL', () => {
    expect(envSchema.safeParse({ ...base, MEDIA_PUBLIC_BASE_URL: '' }).success).toBe(true);
    expect(
      envSchema.safeParse({ ...base, MEDIA_PUBLIC_BASE_URL: 'https://media.example.com' }).success
    ).toBe(true);
  });

  it('rejects placeholder secrets in production', () => {
    expect(
      envSchema.safeParse({ ...base, JWT_SECRET: 'change-me-change-me-change-me-xx' }).success
    ).toBe(false);
  });

  it('requires ENCRYPTION_KEY_OLD when ENCRYPTION_KEY_ACTIVE=v0', () => {
    expect(envSchema.safeParse({ ...base, ENCRYPTION_KEY_ACTIVE: 'v0' }).success).toBe(false);
  });

  it('allows sim modes in development', () => {
    expect(
      envSchema.safeParse({
        ...base,
        NODE_ENV: 'development',
        HEALTH_SIM_MODE: 'true',
        PLAYBACK_SIM_MODE: 'true',
      }).success
    ).toBe(true);
  });
});
