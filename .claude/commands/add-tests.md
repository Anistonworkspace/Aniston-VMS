# /add-tests — Write Tests for a Module or File

Invokes `agent-test-writer` to write complete Vitest unit/integration tests and Playwright E2E tests for a specified file or module.

---

## Usage

```
/add-tests <target>
```

Examples:
- `/add-tests apps/api/src/modules/camera/camera.service.ts`
- `/add-tests apps/web/src/features/live-wall/LiveWallPage.tsx`
- `/add-tests auth module`
- `/add-tests e2e incident escalation flow`

---

## What this does

### For a backend service file
1. Reads the service file (NestJS `@Injectable()` provider) to understand all public methods
2. Identifies the Prisma models, external calls, and error paths
3. Writes a `<name>.service.spec.ts` file with:
   - Mocks for Prisma, bcrypt, JWT, Redis, BullMQ, nodemailer/WhatsApp client
   - Happy path test for every public method
   - Error path: resource not found (404), wrong org/zone-scope (403), invalid `CameraStatus`/`IncidentStatus` transition (400)
   - Transaction rollback test (if `$transaction` is used)
   - Self-action guard test (e.g. an operator can't acknowledge/resolve an Incident outside their zone scope, if such a guard exists)
   - Encryption round-trip test for any `*Encrypted` field the service touches (`rtspPasswordEncrypted`, `apiKeyEncrypted`, `simPinEncrypted`)
4. Verifies coverage meets the 80% threshold in `apps/api/vitest.config.ts`

### For a frontend component or page
1. Reads the component to understand RTK Query hooks, user interactions, and conditional renders
2. Writes a `__tests__/<Name>.test.tsx` file with:
   - Renders without crashing
   - Loading skeleton shown while fetching (e.g. live-wall tiles while a stream connects)
   - Error state renders correctly
   - Happy path: data renders correctly
   - User interaction: button clicks, form submits
   - Role-based UI: admin-only controls (e.g. edit camera credentials) hidden from `CLIENT_VIEWER`
3. Uses `@testing-library/react` + `vi.mock()` of the RTK Query API slice. Example:
   ```typescript
   // mock the api slice so RTK Query hooks return what the test wants
   vi.mock('../cameraApi', () => ({
     useListCamerasQuery: () => ({ data: { data: [cameraFixture], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } }, isLoading: false, isError: false }),
     useCreateCameraMutation: () => [vi.fn().mockResolvedValue({ unwrap: () => Promise.resolve(cameraFixture) }), { isLoading: false }],
   }));
   ```
   This avoids the `msw` dependency entirely and matches the existing codebase pattern.

### For E2E (Playwright)
1. Writes a `e2e/<feature>.spec.ts` file covering:
   - Full happy path workflow
   - Auth guard: unauthenticated redirect
   - Role-based access: `CLIENT_VIEWER` vs `PROJECT_ADMIN` vs `SUPER_ADMIN`
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
