import { defineConfig } from 'vitest/config';

// Root-level Vitest project for standalone `prisma/` scripts (seed-admin, etc.).
// The backend/frontend workspaces own their own vitest configs; this one is
// scoped ONLY to prisma tests so `npm run test:prisma` can exercise seed logic
// against a mocked Prisma client (never a real database).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['prisma/**/*.test.ts'],
  },
});
