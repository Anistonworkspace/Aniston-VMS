import 'dotenv/config';
import { PrismaClient, Role, ScopeType } from '@prisma/client';
import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// Standalone admin bootstrap — creates (or updates) a single SUPER_ADMIN user
// with an ALL access scope, WITHOUT wiping any data.
//
// Unlike `prisma/seed.ts` (a destructive wipe-and-reseed of the full demo
// dataset), this script is idempotent and safe to run against a populated
// database — including staging/production — to bootstrap or reset an admin
// login. It only touches the User + UserAccessScope rows for one email.
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

interface AdminConfig {
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

async function main(): Promise<void> {
  const cfg = resolveConfig();
  const existing = await prisma.user.findUnique({ where: { email: cfg.email } });

  // Only (re)hash + write the password when creating a new user, or when a
  // password was supplied explicitly — so re-running without ADMIN_PASSWORD
  // never clobbers a rotated credential on an existing account.
  const writePassword = existing === null || cfg.passwordExplicit;
  const passwordHash = writePassword ? await bcrypt.hash(cfg.password, BCRYPT_ROUNDS) : undefined;

  const user = await prisma.$transaction(async (tx) => {
    const upserted = await tx.user.upsert({
      where: { email: cfg.email },
      create: {
        email: cfg.email,
        // create always needs a hash; writePassword is true on the create path.
        passwordHash: passwordHash as string,
        name: cfg.name,
        phone: cfg.phone,
        role: Role.SUPER_ADMIN,
        isActive: true,
      },
      update: {
        name: cfg.name,
        phone: cfg.phone,
        role: Role.SUPER_ADMIN,
        isActive: true,
        ...(writePassword ? { passwordHash } : {}),
      },
    });

    // Ensure exactly one ALL access scope (SUPER_ADMIN sees everything).
    const allScope = await tx.userAccessScope.findFirst({
      where: { userId: upserted.id, scopeType: ScopeType.ALL },
    });
    if (!allScope) {
      await tx.userAccessScope.create({
        data: { userId: upserted.id, scopeType: ScopeType.ALL, scopeId: null },
      });
    }

    return upserted;
  });

  const action = existing === null ? 'created' : 'updated';
  const usingDemo = !cfg.passwordExplicit;
  console.log('----------------------------------------------------------------');
  console.log(`  Admin ${action}: ${user.email}`);
  console.log(`  Role:     ${user.role}  ·  Scope: ALL  ·  id: ${user.id}`);
  console.log(`  Password: ${writePassword ? 'set/updated' : 'unchanged (no ADMIN_PASSWORD provided)'}`);
  if (writePassword && usingDemo) {
    console.log(`  Password value (public demo default): ${DEMO_PASSWORD}`);
  } else if (writePassword) {
    console.log('  Password value: (from ADMIN_PASSWORD — not printed)');
  }
  console.log('----------------------------------------------------------------');
}

main()
  .catch((err) => {
    console.error('[seed-admin] failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
