# Skill — Testing Patterns

Backend (`backend/`, NestJS): **Jest** — the framework's default runner, driven
through `@nestjs/testing`.
Frontend (`frontend/`): **Vitest** + **React Testing Library (RTL)**.
E2E (`e2e/`): **Playwright**.

Canon: `docs/02-TRD.md` (test strategy), `docs/06-implementation-plan.md`
(per-stage test gates).

---

## Backend service unit test (Jest + NestJS testing module)

```typescript
// backend/src/modules/incident/__tests__/incident.service.spec.ts
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { IncidentService } from '../incident.service';
import { PrismaService } from '../../../lib/prisma.service';
import { AuditLogger } from '../../../lib/audit.logger';

// 1. Mock every external dependency the service touches
const mockPrisma = {
  incident: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn((fn) =>
    fn({
      incident: { create: jest.fn(), update: jest.fn() },
      auditLog: { create: jest.fn() },
    }),
  ),
};
const mockAuditLogger = { log: jest.fn() };
const mockEscalationQueue = { add: jest.fn() };

// 2. Shared fixtures
const mockActor = {
  id: 'actor-uuid',
  email: 'ops@aniston-vms.example',
  role: 'PROJECT_ADMIN',
  organizationId: 'org-uuid',
};

describe('IncidentService', () => {
  let service: IncidentService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        IncidentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogger, useValue: mockAuditLogger },
        { provide: getQueueToken('escalation'), useValue: mockEscalationQueue },
      ],
    }).compile();
    service = moduleRef.get(IncidentService);
  });

  describe('createFromHealthCheck', () => {
    it('creates an Incident (ANI-CAM-2026-000145-style ref) when a camera goes CAMERA_OFFLINE', async () => {
      (mockPrisma.incident.findFirst as jest.Mock).mockResolvedValue(null); // no open duplicate

      await service.createFromHealthCheck({
        cameraId: 'CAM-042',
        checkType: 'CAMERA_OFFLINE',
        organizationId: 'org-uuid',
      });

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockEscalationQueue.add).toHaveBeenCalledWith(
        'evaluate-escalation',
        expect.objectContaining({ cameraId: 'CAM-042' }),
      );
    });

    it('throws ConflictError when an open Incident already exists for the camera', async () => {
      (mockPrisma.incident.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-incident' });

      await expect(
        service.createFromHealthCheck({ cameraId: 'CAM-042', checkType: 'CAMERA_OFFLINE', organizationId: 'org-uuid' }),
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('acknowledge', () => {
    it('throws ForbiddenError when a CLIENT_VIEWER tries to acknowledge', async () => {
      await expect(
        service.acknowledge('incident-uuid', { ...mockActor, role: 'CLIENT_VIEWER' }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("throws NotFoundError when the incident is outside the actor's organization", async () => {
      (mockPrisma.incident.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.acknowledge('missing-uuid', mockActor)).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
```

## Frontend component test (React Testing Library + Vitest)

```typescript
// frontend/src/features/incidents/__tests__/IncidentKanban.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { IncidentKanban } from '../IncidentKanban';

// Mock the RTK Query hooks
vi.mock('../incidents.api', () => ({
  useListIncidentsQuery: vi.fn(),
  useAcknowledgeIncidentMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

import { useListIncidentsQuery } from '../incidents.api';

describe('IncidentKanban', () => {
  it('shows a skeleton while loading', () => {
    (useListIncidentsQuery as any).mockReturnValue({ isLoading: true });
    render(<IncidentKanban />);
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });

  it('shows an error state on failure', () => {
    (useListIncidentsQuery as any).mockReturnValue({ isLoading: false, isError: true });
    render(<IncidentKanban />);
    expect(screen.getByText(/failed to load incidents/i)).toBeInTheDocument();
  });

  it('renders an incident card with its ANI-CAM ref', () => {
    (useListIncidentsQuery as any).mockReturnValue({
      isLoading: false,
      data: {
        data: [{ id: '1', ref: 'ANI-CAM-2026-000145', cameraId: 'CAM-042', status: 'OPEN' }],
        meta: { page: 1, limit: 20, total: 1 },
      },
    });
    render(<IncidentKanban />);
    expect(screen.getByText('ANI-CAM-2026-000145')).toBeInTheDocument();
  });
});
```

## Playwright E2E test structure

```typescript
// e2e/incidents.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Incident triage', () => {
  test.beforeEach(async ({ page }) => {
    // Sign in as PROJECT_ADMIN before each test
    await page.goto('/login');
    await page.fill('[name=email]', 'admin@aniston-vms.example');
    await page.fill('[name=password]', 'Admin@123');
    await page.click('[type=submit]');
    await page.waitForURL('/dashboard');
  });

  test('PROJECT_ADMIN can acknowledge an open incident', async ({ page }) => {
    await page.goto('/dashboard/incidents');
    await page.click('text=ANI-CAM-2026-000145');
    await page.click('text=Acknowledge');
    await expect(page.locator('text=Incident acknowledged')).toBeVisible();
  });

  test('CLIENT_VIEWER cannot see the acknowledge button', async ({ page }) => {
    // ... sign in as CLIENT_VIEWER instead of PROJECT_ADMIN
    await page.goto('/dashboard/incidents');
    await expect(page.locator('text=Acknowledge')).not.toBeVisible();
  });
});
```

## Coverage requirements

| Layer | Minimum |
|-------|---------|
| Services (camera / zone / incident / health / escalation) | ≥ 80% lines |
| Utilities (encryption, health-score scoring, audit) | ≥ 90% lines |
| Frontend components | ≥ 70% lines |

Run: `pnpm --filter @aniston-vms/api test:coverage`