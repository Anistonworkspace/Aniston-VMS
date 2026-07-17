import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_SEED !== 'true') {
    console.error('Refusing to seed production database. Set ALLOW_PROD_SEED=true to override.');
    process.exit(1);
  }

  console.log('Seeding database...');

  const org = await prisma.organization.upsert({
    where: { slug: 'demo-org' },
    update: {},
    create: {
      name: 'Demo Organization',
      slug: 'demo-org',
      isActive: true,
    },
  });

  const passwordHash = await bcrypt.hash('Admin@12345', 12);

  await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'admin@example.com' } },
    update: {},
    create: {
      organizationId: org.id,
      email: 'admin@example.com',
      passwordHash,
      fullName: 'Super Admin',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  });

  await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'manager@example.com' } },
    update: {},
    create: {
      organizationId: org.id,
      email: 'manager@example.com',
      passwordHash,
      fullName: 'Demo Manager',
      role: 'MANAGER',
      status: 'ACTIVE',
    },
  });

  await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'employee@example.com' } },
    update: {},
    create: {
      organizationId: org.id,
      email: 'employee@example.com',
      passwordHash,
      fullName: 'Demo Employee',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    },
  });

  await prisma.department.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Engineering' } },
    update: {},
    create: { organizationId: org.id, name: 'Engineering', description: 'Software engineering team' },
  });

  await prisma.designation.upsert({
    where: { organizationId_title: { organizationId: org.id, title: 'Software Engineer' } },
    update: {},
    create: { organizationId: org.id, title: 'Software Engineer', level: 2 },
  });

  console.log('Seed complete.');
  console.log('Login: admin@example.com / Admin@12345');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
