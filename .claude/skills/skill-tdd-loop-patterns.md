# Skill — Test-Driven Loop Patterns

Test-first workflow for the `/build-loop` command. Writes failing tests
first, then loops implement → run → fix until every test passes — or a cost
cap is hit.

Prereqs: Jest for `backend/` (NestJS, via `@nestjs/testing`), Vitest + React
Testing Library for `frontend/`, Playwright for E2E (all already installed).
Canon: `docs/06-implementation-plan.md` (stage test gates), `docs/05-backend-schema.md`
(HealthCheck / Incident models).

---

## Worked example — TDD a health-check → incident rule

The rule under test: **when a camera logs 3 consecutive `CAMERA_OFFLINE`
health checks inside a 10-minute window, the system must auto-create an
Incident** (ref pattern `ANI-CAM-{year}-{sequence}`, e.g.
`ANI-CAM-2026-000145`) **and enqueue an escalation-evaluation job.** A
`RECOVERY_VERIFIED` check anywhere in the streak resets it — no Incident.

### Step 1 — Write failing tests for the rule first

```typescript
// backend/src/modules/health/__tests__/health-check.service.spec.ts
import { Test } from '@nestjs/testing';
import { HealthCheckService } from '../health-check.service';
import { IncidentService } from '../../incident/incident.service';
import { PrismaService } from '../../../lib/prisma.service';

const mockPrisma = {
  healthCheck: { findMany: jest.fn(), create: jest.fn() },
};
const mockIncidentService = { createFromHealthCheck: jest.fn() };

describe('HealthCheckService.recordCheck', () => {
  let service: HealthCheckService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthCheckService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: IncidentService, useValue: mockIncidentService },
      ],
    }).compile();
    service = moduleRef.get(HealthCheckService);
  });

  it('creates an Incident after 3 consecutive CAMERA_OFFLINE checks within 10 minutes', async () => {
    (mockPrisma.healthCheck.findMany as jest.Mock).mockResolvedValue([
      { checkType: 'CAMERA_OFFLINE', checkedAt: new Date('2026-07-17T10:00:00Z') },
      { checkType: 'CAMERA_OFFLINE', checkedAt: new Date('2026-07-17T10:04:00Z') },
    ]);
    (mockPrisma.healthCheck.create as jest.Mock).mockResolvedValue({
      id: 'hc-3',
      checkType: 'CAMERA_OFFLINE',
      checkedAt: new Date('2026-07-17T10:08:00Z'),
    });

    await service.recordCheck({ cameraId: 'CAM-042', checkType: 'CAMERA_OFFLINE', organizationId: 'org-uuid' });

    expect(mockIncidentService.createFromHealthCheck).toHaveBeenCalledWith(
      expect.objectContaining({ cameraId: 'CAM-042' }),
    );
  });

  it('does NOT create an Incident when a RECOVERY_VERIFIED check breaks the streak', async () => {
    (mockPrisma.healthCheck.findMany as jest.Mock).mockResolvedValue([
      { checkType: 'CAMERA_OFFLINE', checkedAt: new Date('2026-07-17T10:00:00Z') },
      { checkType: 'RECOVERY_VERIFIED', checkedAt: new Date('2026-07-17T10:04:00Z') },
    ]);

    await service.recordCheck({ cameraId: 'CAM-042', checkType: 'CAMERA_OFFLINE', organizationId: 'org-uuid' });

    expect(mockIncidentService.createFromHealthCheck).not.toHaveBeenCalled();
  });
});
```

Also stub the RTK Query interaction test and the E2E test in the same pass
(see Step 3/E2E below) — all three should fail red before any implementation
code exists.

### Step 2 — Run, confirm red for the right reason

```powershell
pnpm --filter @aniston-vms/api test -- health-check.service.spec.ts
```

Expect a failure like "`HealthCheckService.recordCheck` is not a function" —
**not** a typo in the test itself. If the test fails on a mistyped import or
fixture, fix the test before moving on; a red test for the wrong reason
teaches you nothing.

### Step 3 — Implement backend + frontend

- Backend: `HealthCheckService.recordCheck` (streak-count query over the last
  10 minutes) → `IncidentService.createFromHealthCheck` (transaction: create
  `Incident`, `auditLogger.log('INCIDENT_CREATED', …)`, enqueue the
  `escalation` BullMQ job).
- Frontend: add `createIncident` / `listIncidents` endpoints to
  `incidents.api.ts`; render the new row in `IncidentKanban`.

```typescript
// frontend/src/features/incidents/__tests__/incidents.interaction.test.tsx
vi.mock('../incidents.api', () => ({
  useListIncidentsQuery: vi.fn(),
  useCreateIncidentMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));
```

### Step 4 — Loop implement → run → fix until green

Re-run the full suite after each change; don't hand-pick which test to
re-run. Stop the loop as soon as:

- Every test passes, **or**
- `BUILD_LOOP_MAX_ITERATIONS` iterations have run, **or**
- `BUILD_LOOP_MAX_TOKENS` has been spent

whichever comes first — checked every loop, not just at the end. When the cap
is hit before green, stop and hand back a status report of what's still red
instead of silently continuing past budget.

---

## E2E — prove the whole rule end-to-end

```typescript
// e2e/health-to-incident.spec.ts
import { test, expect } from '@playwright/test';

test('3 consecutive CAMERA_OFFLINE checks raise a visible Incident', async ({ page }) => {
  await signInAs(page, 'SUPER_ADMIN');

  await triggerHealthCheck(page, 'CAM-042', 'CAMERA_OFFLINE'); // test-harness helper, x3
  await triggerHealthCheck(page, 'CAM-042', 'CAMERA_OFFLINE');
  await triggerHealthCheck(page, 'CAM-042', 'CAMERA_OFFLINE');

  await page.goto('/dashboard/incidents');
  await expect(page.locator('text=ANI-CAM-2026-000145')).toBeVisible();
});
```

---

## Checklist

- [ ] Tests written before implementation, and observed failing first (red) for the right reason
- [ ] Backend service test asserts both the Incident creation AND the escalation job enqueue
- [ ] Frontend RTK Query interaction test exercises `providesTags`/`invalidatesTags`
- [ ] E2E test drives the real rule (camera health → incident → UI), not just a mocked API
- [ ] Loop stops at green, or at the cost cap (`BUILD_LOOP_MAX_ITERATIONS` / `BUILD_LOOP_MAX_TOKENS`) — never silently past it
- [ ] `/verify-wired` run once green, before marking the rule done