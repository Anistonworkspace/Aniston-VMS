# /add-tests — Write Tests for a Module or File

Invokes `agent-test-writer` to write complete Vitest unit/integration tests and Playwright E2E tests for a specified file or module.

---

## Usage

```
/add-tests <target>
```

Examples:
- `/add-tests backend/src/modules/item/item.service.ts`
- `/add-tests frontend/src/features/dashboard/DashboardPage.tsx`
- `/add-tests auth module`
- `/add-tests e2e item approval flow`

---

## What this does

### For a backend service file
1. Reads the service file to understand all public methods
2. Identifies the Prisma models, external calls, and error paths
3. Writes a `__tests__/<name>.service.test.ts` file with:
   - Mocks for Prisma, bcrypt, JWT, Redis, BullMQ, nodemailer
   - Happy path test for every public method
   - Error path: resource not found (404), wrong org (403), wrong status (400)
   - Transaction rollback test (if `$transaction` is used)
   - Self-approval check test (if approval logic exists)
4. Verifies coverage meets the 80% threshold in `vitest.config.ts`

### For a frontend component or page
1. Reads the component to understand RTK Query hooks, user interactions, and conditional renders
2. Writes a `__tests__/<Name>.test.tsx` file with:
   - Renders without crashing
   - Loading skeleton shown while fetching
   - Error state renders correctly
   - Happy path: data renders correctly
   - User interaction: button clicks, form submits
   - Role-based UI: admin-only items hidden from MEMBER role
3. Uses `@testing-library/react` + `vi.mock()` of the RTK Query API slice. Example:
   ```typescript
   // mock the api slice so RTK Query hooks return what the test wants
   vi.mock('../itemApi', () => ({
     useListItemsQuery: () => ({ data: { data: [itemFixture], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } }, isLoading: false, isError: false }),
     useCreateItemMutation: () => [vi.fn().mockResolvedValue({ unwrap: () => Promise.resolve(itemFixture) }), { isLoading: false }],
   }));
   ```
   This avoids the `msw` dependency entirely and matches the existing codebase pattern.

### For E2E (Playwright)
1. Writes a `e2e/<feature>.spec.ts` file covering:
   - Full happy path workflow
   - Auth guard: unauthenticated redirect
   - Role-based access: MEMBER vs ADMIN vs SUPER_ADMIN
   - Form validation errors shown
   - Success notification shown after mutation

---

## Coverage targets (from `rule-testing-standards.md`)
- Backend services: ≥ 80% line coverage
- Utilities: ≥ 90% line coverage
- Frontend components: ≥ 70% line coverage

---

## Rules that apply
- `.claude/rules/rule-testing-standards.md`
- `.claude/rules/rule-backend.md`
- `.claude/rules/rule-frontend.md`
