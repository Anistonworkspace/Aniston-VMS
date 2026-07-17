# Skill — Testing Patterns

---

## Service unit test structure (Vitest)

```typescript
// backend/src/modules/item/__tests__/item.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ItemService } from '../item.service.js';

// 1. Mock all external dependencies
vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    item: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn({
      item: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      auditLog: { create: vi.fn() },
    })),
  },
}));

vi.mock('../../../utils/auditLogger.js', () => ({
  auditLogger: { log: vi.fn() },
}));

vi.mock('../../../jobs/queues.js', () => ({
  emailQueue: { add: vi.fn() },
}));

// 2. Import mocks for assertions
import { prisma } from '../../../lib/prisma.js';

// 3. Shared test fixtures
const mockActor = {
  id: 'actor-uuid',
  email: 'admin@example.com',
  role: 'ADMIN',
  organizationId: 'org-uuid',
  name: 'Test Admin',
};

describe('ItemService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('create', () => {
    it('creates item when data is valid', async () => {
      (prisma.item.findFirst as any).mockResolvedValue(null); // no duplicate

      const result = await ItemService.create(
        { name: 'Alice', email: 'alice@example.com', categoryId: 'cat-uuid' },
        mockActor,
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('throws ConflictError when email already exists in org', async () => {
      (prisma.item.findFirst as any).mockResolvedValue({ id: 'existing' }); // duplicate found

      await expect(
        ItemService.create({ name: 'Alice', email: 'alice@example.com', categoryId: 'cat-uuid' }, mockActor)
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('getOne', () => {
    it('throws NotFoundError when item not in org', async () => {
      (prisma.item.findFirst as any).mockResolvedValue(null);

      await expect(ItemService.getOne('non-existent-id', mockActor))
        .rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
```

## Frontend component test (React Testing Library)

```typescript
// frontend/src/features/item/__tests__/ItemList.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ItemList } from '../ItemList.js';

// Mock RTK Query hook
vi.mock('../item.api.js', () => ({
  useListItemsQuery: vi.fn(),
  useCreateItemMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

import { useListItemsQuery } from '../item.api.js';

describe('ItemList', () => {
  it('shows skeleton while loading', () => {
    (useListItemsQuery as any).mockReturnValue({ isLoading: true });
    render(<ItemList />);
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });

  it('shows error state on failure', () => {
    (useListItemsQuery as any).mockReturnValue({ isLoading: false, isError: true });
    render(<ItemList />);
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });

  it('renders item list when data loads', () => {
    (useListItemsQuery as any).mockReturnValue({
      isLoading: false,
      data: { data: [{ id: '1', name: 'Alice' }], meta: { page: 1, limit: 20, total: 1 } },
    });
    render(<ItemList />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });
});
```

## Playwright E2E test structure

```typescript
// e2e/item.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Item module', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin before each test
    await page.goto('/login');
    await page.fill('[name=email]', 'admin@demo.com');
    await page.fill('[name=password]', 'Admin@123');
    await page.click('[type=submit]');
    await page.waitForURL('/dashboard');
  });

  test('ADMIN can create an item', async ({ page }) => {
    await page.goto('/dashboard/items');
    await page.click('text=Add Item');
    await page.fill('[name=name]', 'Test Item');
    await page.fill('[name=email]', 'test@example.com');
    await page.click('[type=submit]');
    await expect(page.locator('text=Item created')).toBeVisible();
  });

  test('MEMBER cannot see the create button', async ({ page }) => {
    // Login as member instead
    await page.goto('/dashboard/items');
    await expect(page.locator('text=Add Item')).not.toBeVisible();
  });
});
```

## Coverage requirements

| Layer | Minimum |
|-------|---------|
| Services | ≥ 80% lines |
| Utilities | ≥ 90% lines |
| Frontend components | ≥ 70% lines |

Run: `npm run test:coverage --workspace=backend`
