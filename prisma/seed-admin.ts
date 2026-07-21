import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// Standalone admin maintenance — UPDATE-ONLY and non-escalating by design.
//
// This script NEVER creates users, NEVER assigns or changes a role, and NEVER
// grants access scopes. It only updates an account that is ALREADY a
// SUPER_ADMIN (matched by email) - e.g. to rotate its password. If no such
// user exists, or the matched account is not a SUPER_ADMIN, it makes NO
// database changes at all.
//
// Unlike `prisma/seed.ts` (a destructive wipe-and-reseed of the full demo
// dataset), this script is idempotent and safe to run against a populated
// database - including staging/production.
//
//   npm run db:seed:admin
//
// Config (all optional except in production, see below) — via env / repo .env:
//   ADMIN_EMAIL     default: admin@anistonvms.example  (stored lower-cased)
//   ADMIN_PASSWORD  default: the public demo password (NON-production only)
//   ADMIN_NAME      default: Aniston Super Admin
//   ADMIN_PHONE     default: +91-9800000001
//
// Production guardrails (NODE_ENV=production):
//   - ADMIN_PASSWORD is REQUIRED (no demo-password fallback).
//   - ALLOW_PROD_SEED=true must be set explicitly, or the script refuses to run.
// ---------------------------------------------------------------------------

const prisma = new PrismaClient();

/** Cost factor — matches BCRYPT_ROUNDS in backend/src/modules/auth/auth.service.ts. */
const BCRYPT_ROUNDS = 12;

/**
 * Public demo password shown on the login page (DEMO_PASSWORD in prisma/seed.ts).
 * Used only as a convenience default OUTSIDE production so a fresh dev DB has a
 * working admin login out of the box. Never used when NODE_ENV=production.
 */
const DEMO_PASSWORD = 'AdminDemo2026!';

/** Login lower-cases the email (auth.schemas.ts), so store it that way too. */
const DEFAULT_EMAIL = 'admin@anistonvms.example';
const DEFAULT_NAME = 'Aniston Super Admin';
const DEFAULT_PHONE = '+91-9800000001';

/** newPassword in changePasswordSchema requires >= 12, so enforce the stronger rule. */
const MIN_PASSWORD_LEN = 12;
const MAX_PASSWORD_LEN = 128;

export interface AdminConfig {
  email: string;
  name: string;
  phone: string;
  password: string;
  /** True when ADMIN_PASSWORD was supplied explicitly (vs. the demo fallback). */
  passwordExplicit: boolean;
}

function resolveConfig(): AdminConfig {
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd && process.env.ALLOW_PROD_SEED !== 'true') {
    throw new Error(
      'Refusing to run admin bootstrap in production without ALLOW_PROD_SEED=true. ' +
        'Set ALLOW_PROD_SEED=true (and ADMIN_PASSWORD=...) to proceed intentionally.'
    );
  }

  const email = (process.env.ADMIN_EMAIL ?? DEFAULT_EMAIL).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error(`ADMIN_EMAIL is not a valid email address: "${email}"`);
  }

  const rawPassword = process.env.ADMIN_PASSWORD;
  const passwordExplicit = typeof rawPassword === 'string' && rawPassword.length > 0;

  if (!passwordExplicit && isProd) {
    throw new Error('ADMIN_PASSWORD is required when NODE_ENV=production (no demo-password fallback).');
  }

  const password = passwordExplicit ? (rawPassword as string) : DEMO_PASSWORD;
  if (password.length < MIN_PASSWORD_LEN || password.length > MAX_PASSWORD_LEN) {
    throw new Error(
      `ADMIN_PASSWORD must be ${MIN_PASSWORD_LEN}-${MAX_PASSWORD_LEN} characters (got ${password.length}).`
    );
  }

  return {
    email,
    name: (process.env.ADMIN_NAME ?? DEFAULT_NAME).trim(),
    phone: (process.env.ADMIN_PHONE ?? DEFAULT_PHONE).trim(),
    password,
    passwordExplicit,
  };
}

export type AdminUpdateOutcome =
  | { status: 'updated'; userId: string; passwordChanged: boolean }
  | { status: 'skipped'; reason: 'not-found' | 'not-super-admin' };

/**
 * Update-only, non-escalating admin maintenance.
 *
 * Safety contract (enforced here, covered by seed-admin.test.ts):
 *   - Never creates a user (no create / createMany / upsert).
 *   - Never assigns or changes a role (no promotion).
 *   - Never grants access scopes.
 *   - Only mutates an account that is ALREADY a SUPER_ADMIN.
 *   - A missing account, or a non-SUPER_ADMIN match, performs ZERO writes.
 */
export async function applyAdminUpdate(
  db: PrismaClient,
  cfg: AdminConfig,
): Promise<AdminUpdateOutcome> {
  const existing = await db.user.findUnique({ where: { email: cfg.email } });

  // No account for this email -> do nothing. We never create accounts.
  if (existing === null) {
    return { status: 'skipped', reason: 'not-found' };
  }

  // Account exists but is not already a SUPER_ADMIN -> do nothing. We never
  // promote; this guard is what makes the tool non-escalating.
  if (existing.role !== Role.SUPER_ADMIN) {
    return { status: 'skipped', reason: 'not-super-admin' };
  }

  // Only (re)hash + write the password when one was supplied explicitly, so a
  // routine run never clobbers a manually rotated credential.
  const passwordChanged = cfg.passwordExplicit;
  const passwordHash = passwordChanged
    ? await bcrypt.hash(cfg.password, BCRYPT_ROUNDS)
    : undefined;

  // Update profile/credential fields ONLY. `role` is intentionally never part
  // of this payload, and access scopes are never touched.
  await db.user.update({
    where: { id: existing.id },
    data: {
      name: cfg.name,
      phone: cfg.phone,
      isActive: true,
      ...(passwordChanged ? { passwordHash } : {}),
    },
  });

  return { status: 'updated', userId: existing.id, passwordChanged };
}

async function main(): Promise<void> {
  const cfg = resolveConfig();
  const outcome = await applyAdminUpdate(prisma, cfg);

  if (outcome.status === 'skipped') {
    const why =
      outcome.reason === 'not-found'
        ? `no user exists for ${cfg.email}`
        : `the account for ${cfg.email} is not a SUPER_ADMIN`;
    console.error(
      `[seed-admin] No changes made: ${why}. This tool only updates an ` +
        'existing SUPER_ADMIN; it never creates accounts or changes roles. ' +
        'Nothing was written to the database.',
    );
    process.exitCode = 1;
    return;
  }

  console.info('----------------------------------------------------------------');
  console.info(`  SUPER_ADMIN updated: ${cfg.email}  (id: ${outcome.userId})`);
  console.info('  Role: SUPER_ADMIN (unchanged)  |  Access scopes: unchanged');
  console.info(
    `  Password: ${outcome.passwordChanged ? 'updated' : 'unchanged (no ADMIN_PASSWORD provided)'}`,
  );
  console.info('----------------------------------------------------------------');
}

// Only run as a CLI (`tsx prisma/seed-admin.ts`). Importing this module (e.g.
// from tests) must NOT execute main() or touch the database.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main()
    .catch((err) => {
      console.error('[seed-admin] failed:', err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => {
      void prisma.$disconnect();
    });
}
