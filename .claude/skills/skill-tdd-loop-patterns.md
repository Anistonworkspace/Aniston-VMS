# Skill — Test-Driven Loop Patterns

Test-first workflow for the `/build-loop` command. Writes failing tests
BEFORE implementation, then loops implement-run-fix until every test passes
or a cost cap is hit.

Prereqs: Vitest for backend + frontend, Playwright for E2E (already
installed in Batch 2 of the prior audit). MSW is NOT used — mock RTK Query
via `vi.mock` (per Batch 2 of prior audit).

---

## Rule 1 — Tests written first, always

The build loop's first step is generating failing tests. Never let the model
implement first and add tests after — that flips the correctness signal from
"tests validate behavior" to "tests validate whatever the code happens to do".

## Rule 2 — Tests cover: happy + 3 error paths + RBAC matrix

For every public method / route / component:

- **Happy path** — expected input → expected output
- **Error path 1** — resource not found (404 for routes, `NotFoundError` for services)
- **Error path 2** — permission denied (403 / `ForbiddenError`)
- **Error path 3** — validation failure (400 / `ValidationError`) OR state
  conflict (409 / `ConflictError`) — pick the more likely for the method
- **RBAC matrix** — one test per role for critical routes (SUPER_ADMIN, ADMIN,
  MEMBER — see rule-testing-standards.md)

## Rule 3 — Cost cap is mandatory

Default: max 5 loop iterations, max 200 000 output tokens across the loop.
Configurable via env: `BUILD_LOOP_MAX_ITERATIONS`, `BUILD_LOOP_MAX_TOKENS`.
When a cap is hit, the loop stops with a clear "last-mile diff" report — no
silent partial commit.

---

## Pattern 1 — Backend service test scaffold

```typescript
// backend/src/modules/notes/__tests__/notes.service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotesService } from '../notes.service.js';
import { prisma } from '../../../lib/prisma.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../../middleware/errorHandler.js';
import type { AuthUser } from '@boilerplate/shared';

// Mock prisma — never hit a real DB in unit tests
vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    note: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn((fn) => (typeof fn === 'function' ? fn(prisma) : Promise.all(fn))),
  },
}));

// Mock auditLogger — verify it's called
vi.mock('../../../utils/auditLogger.js', () => ({
  auditLogger: { log: vi.fn() },
}));

const actor: AuthUser = {
  id: 'user-1', email: 'a@x', role: 'ADMIN' as any, organizationId: 'org-1', name: 'A',
};

describe('NotesService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a note with organization scope and audit log', async () => {
    (prisma.note.findFirst as any).mockResolvedValue(null);
    (prisma.note.create as any).mockResolvedValue({ id: 'note-1', title: 'x', organizationId: 'org-1' });

    const result = await NotesService.create({ title: 'x' } as any, actor);

    expect(result).toMatchObject({ id: 'note-1', organizationId: 'org-1' });
    expect(prisma.note.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: 'org-1' }),
    }));
    // Verify audit log
    // expect(auditLogger.log).toHaveBeenCalled();
  });

  it('throws ConflictError when duplicate exists in same org', async () => {
    (prisma.note.findFirst as any).mockResolvedValue({ id: 'existing', title: 'x' });
    await expect(NotesService.create({ title: 'x' } as any, actor)).rejects.toThrow(ConflictError);
  });
});

describe('NotesService.getOne', () => {
  it('returns note when it exists and belongs to actor org', async () => {
    (prisma.note.findFirst as any).mockResolvedValue({ id: 'n1', organizationId: 'org-1' });
    await expect(NotesService.getOne('n1', actor)).resolves.toMatchObject({ id: 'n1' });
    expect(prisma.note.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'n1', organizationId: 'org-1', deletedAt: null }),
    }));
  });

  it('throws NotFoundError when note does not exist', async () => {
    (prisma.note.findFirst as any).mockResolvedValue(null);
    await expect(NotesService.getOne('missing', actor)).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError when note belongs to different org (IDOR guard)', async () => {
    // The org-scope in findFirst does the filtering — mock returns null for wrong-org
    (prisma.note.findFirst as any).mockResolvedValue(null);
    await expect(NotesService.getOne('other-org-note', actor)).rejects.toThrow(NotFoundError);
  });
});
```

---

## Pattern 2 — Route integration test scaffold

For routes, use supertest against a running Express app instance (in-memory).

```typescript
// backend/src/modules/notes/__tests__/notes.routes.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../app.js';
import { seedTestUser, signInAs, resetDb } from '../../../test/helpers.js';

const app = createApp();

describe('POST /api/notes', () => {
  beforeAll(async () => {
    await resetDb();
    await seedTestUser({ role: 'ADMIN' });
  });

  it('creates a note for authenticated ADMIN', async () => {
    const token = await signInAs('ADMIN');
    const res = await request(app)
      .post('/api/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'hello' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, data: expect.objectContaining({ title: 'hello' }) });
    expect(res.body.data).not.toHaveProperty('passwordHash');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/notes').send({ title: 'x' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for MEMBER role when notes.create requires ADMIN', async () => {
    const token = await signInAs('MEMBER');
    const res = await request(app)
      .post('/api/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'x' });
    expect(res.status).toBe(403);
  });

  it('returns 400 on validation error (missing title)', async () => {
    const token = await signInAs('ADMIN');
    const res = await request(app)
      .post('/api/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });
});
```

---

## Pattern 3 — Frontend component test scaffold

Mock the RTK Query api slice — no MSW required.

```typescript
// frontend/src/features/notes/__tests__/NoteList.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '@/app/store';
import { NoteList } from '../NoteList';

const noteFixture = { id: 'n1', title: 'Hello', createdAt: '2026-07-07T00:00:00Z' };

vi.mock('../notesApi', () => ({
  useListNotesQuery: () => ({
    data: { data: [noteFixture], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } },
    isLoading: false,
    isError: false,
  }),
  useCreateNoteMutation: () => [
    vi.fn().mockResolvedValue({ unwrap: () => Promise.resolve(noteFixture) }),
    { isLoading: false },
  ],
}));

describe('<NoteList />', () => {
  const renderWith = (ui: React.ReactElement) => render(<Provider store={store}>{ui}</Provider>);

  it('renders each note title', async () => {
    renderWith(<NoteList />);
    await waitFor(() => expect(screen.getByText('Hello')).toBeInTheDocument());
  });

  it('shows an empty state when data is empty', async () => {
    vi.mocked((await import('../notesApi')).useListNotesQuery).mockReturnValueOnce({
      data: { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } },
      isLoading: false,
      isError: false,
    } as any);
    renderWith(<NoteList />);
    await waitFor(() => expect(screen.getByText(/Create your first/i)).toBeInTheDocument());
  });

  it('shows a skeleton while loading', async () => {
    vi.mocked((await import('../notesApi')).useListNotesQuery).mockReturnValueOnce({
      data: undefined, isLoading: true, isError: false,
    } as any);
    renderWith(<NoteList />);
    expect(screen.getByTestId('list-skeleton')).toBeInTheDocument();
  });
});
```

---

## Pattern 4 — Playwright E2E scaffold

Wire the full workflow from login → create → verify list → delete.

```typescript
// e2e/notes.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Notes CRUD end-to-end', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@demo.local');
    await page.getByLabel('Password').fill('demo-password');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('creates, lists, and deletes a note', async ({ page }) => {
    await page.getByRole('link', { name: /notes/i }).click();
    await page.getByRole('button', { name: /new note/i }).click();
    await page.getByLabel('Title').fill('First note');
    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByText('First note')).toBeVisible();
    await expect(page.getByRole('status')).toContainText(/created/i);

    // Delete
    await page.getByRole('button', { name: /delete/i }).first().click();
    await page.getByRole('button', { name: /confirm/i }).click();
    await expect(page.getByText('First note')).toBeHidden();
  });

  test('MEMBER role cannot create a note', async ({ page }) => {
    // Sign out + sign in as member
    await page.goto('/logout');
    await page.getByLabel('Email').fill('member@demo.local');
    await page.getByLabel('Password').fill('demo-password');
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.getByRole('link', { name: /notes/i }).click();
    await expect(page.getByRole('button', { name: /new note/i })).toHaveCount(0);
  });
});
```

---

## Pattern 5 — Loop control (implement → run → fix → repeat)

The `/build-loop` command wraps this pseudocode in a `Workflow`:

```
plan
generate_failing_tests
verify_tests_fail                          # expected
implement_backend_layer                    # prisma → service → controller → routes
implement_frontend_layer                   # api → hooks → page
iteration = 1
while iteration <= MAX_ITERATIONS:
    result = run_all_tests
    if result.pass:
        run_verify_wired                   # see skill-wire-completeness-patterns.md
        if wired_ok: break
    parse_failures(result)
    hand_to_agent_debugger(top_1_failure)
    apply_suggested_fix
    iteration += 1
if not converged:
    report_last_mile_diff(iteration, tokens_used)
    exit_with_status(partial)
```

Fail-fast rules inside the loop:

- Same test failing 2 iterations in a row → escalate (larger context, more tools).
- Same test failing 3 iterations in a row → stop, ask the human.
- Token budget exceeded → stop, dump the diff to `memory/plans/_active/<slug>-loop-log.md`.
- Any new TypeScript compile error introduced → stop, revert last edit, retry with different approach.

---

## Pattern 6 — Failing-test-first verification

Before implementation runs, execute the generated tests and CONFIRM they all
fail. If any pass on first run:

- Either the test is wrong (asserting on default / initial state), OR
- The implementation already exists (rare, but check)

Fix the test or delete it before implementation. A "passes without work"
test never catches a regression.

```bash
# Inside the loop
npm test -- --run backend/src/modules/notes/__tests__ 2>&1 | tee .tmp/tests-initial.log
grep -q "0 passed" .tmp/tests-initial.log || echo "WARNING: some tests unexpectedly pass — review"
```

---

## Pattern 7 — Test helper: seedTestUser + signInAs

```typescript
// backend/src/test/helpers.ts
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../modules/auth/auth.service.js';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export async function resetDb() {
  // ORDER matters: delete children first
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

export async function seedTestUser({ role = 'ADMIN' }: { role?: string } = {}) {
  const org = await prisma.organization.create({
    data: { name: 'Test Org', slug: 'test-org' },
  });
  const user = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: `${role.toLowerCase()}@demo.local`,
      passwordHash: await hashPassword('demo-password'),
      fullName: role,
      role: role as any,
      status: 'ACTIVE',
    },
  });
  return { org, user };
}

export async function signInAs(role: string): Promise<string> {
  const user = await prisma.user.findFirst({ where: { role: role as any } });
  if (!user) throw new Error(`No user seeded for role ${role}`);
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, organizationId: user.organizationId },
    env.JWT_SECRET,
    { expiresIn: '15m' },
  );
}
```

---

## Do-not

- **No implementation before tests.** Would flip the correctness signal.
- **No skipped tests without a comment.** `it.skip('...', ...)` should always
  have a `// TODO: skipped because X` line above.
- **No shared mutable state between tests.** Every `beforeEach` calls
  `resetDb` for integration tests, `vi.clearAllMocks()` for units.
- **No test that "just checks the code runs".** If a test doesn't have at least
  one `expect(...)` beyond `expect(fn).not.toThrow()`, delete it.
- **No mocking `prisma.$transaction` incompletely.** The mock must accept
  either an array or a callback and behave correctly for both.
- **No cost cap set to Infinity.** Every `/build-loop` invocation has an
  upper bound. If you need more, run twice with intermediate commit.

---

## Checklist

- [ ] Tests written BEFORE implementation
- [ ] Every public method covered: happy + 3 error paths
- [ ] RBAC matrix covered — one route test per role
- [ ] `beforeEach` resets state (`resetDb` for integration, `clearAllMocks` for unit)
- [ ] Every test has explicit `expect(...)` — no vacuous "did not throw"
- [ ] E2E test covers full workflow: signin → action → verify → cleanup
- [ ] Frontend tests use `vi.mock` of the api slice — no MSW
- [ ] Backend tests use in-memory Express via `createApp()` + supertest
- [ ] Cost cap configured: `BUILD_LOOP_MAX_ITERATIONS` (default 5) and
      `BUILD_LOOP_MAX_TOKENS` (default 200 000)
- [ ] Loop log written to `memory/plans/_active/<slug>-loop-log.md` for audit
