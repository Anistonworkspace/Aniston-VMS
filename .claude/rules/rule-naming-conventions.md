---
# Naming Conventions — Binding for ALL code in this project

## TypeScript / JavaScript

| Thing | Convention | Example |
|-------|-----------|---------|
| Variables | camelCase | `totalItems`, `isLoading` |
| Functions | camelCase | `formatDate()`, `buildWhereClause()` |
| React components | PascalCase | `ItemCard`, `ItemModal` |
| Types / Interfaces | PascalCase | `CreateItemInput`, `AuthUser` |
| Enums | PascalCase (type) + SCREAMING_SNAKE (values) | `enum UserRole { SUPER_ADMIN = 'SUPER_ADMIN' }` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_FILE_SIZE`, `DEFAULT_PAGE_LIMIT` |
| Class names | PascalCase | `ItemService`, `AuditLogger` |
| Files — backend | kebab-case | `item.service.ts`, `auth.controller.ts` |
| Files — frontend | PascalCase for components | `ItemList.tsx`, `ItemModal.tsx` |
| Files — frontend utilities | camelCase | `formatDate.ts`, `useAuth.ts` |

## Prisma / Database

| Thing | Convention | Example |
|-------|-----------|---------|
| Model names | PascalCase singular | `Item`, `AuditLog` |
| Field names | camelCase | `firstName`, `organizationId` |
| Encrypted fields | camelCase + `Encrypted` suffix | `secretEncrypted`, `apiKeyEncrypted` |
| Enum names | PascalCase | `UserRole`, `ItemStatus` |
| Enum values | SCREAMING_SNAKE_CASE | `SUPER_ADMIN`, `PENDING_APPROVAL` |
| Table names (auto) | snake_case plural (Prisma default) | `items`, `audit_logs` |
| Index names | auto from `@@index` fields | handled by Prisma |

## API Routes

| Pattern | Convention | Example |
|---------|-----------|---------|
| Collection | plural noun | `/api/items` |
| Single resource | plural noun + ID param | `/api/items/:id` |
| Sub-resource | nested plural | `/api/items/:id/documents` |
| Action route | noun + verb (avoid) → prefer status update | `/api/items/:id` PATCH with `{ status: 'APPROVED' }` |
| Query params | camelCase | `?sortBy=createdAt&sortDir=desc` |
| Always lowercase, hyphenated | | `/api/audit-logs`, NOT `/api/auditLogs` |

## React / Frontend

| Thing | Convention | Example |
|-------|-----------|---------|
| RTK Query API file | camelCase + `Api` | `itemApi.ts`, `auditLogApi.ts` |
| RTK Query endpoint | camelCase verb + noun | `getItems`, `createItem` |
| Redux slice | camelCase + `Slice` | `authSlice.ts` |
| Custom hook | `use` prefix + PascalCase | `useItemList`, `useItemFilters` |
| Feature folder | camelCase | `features/items/`, `features/auditLogs/` |
| CSS class names | kebab-case (Tailwind utility only) | `floating-card`, `btn--primary` |
| CSS custom properties | kebab-case with `--` prefix | `--primary-color`, `--border-radius-medium` |

## Files and Folders

| Location | Convention | Example |
|----------|-----------|---------|
| Backend module folder | camelCase | `backend/src/modules/item/` |
| Frontend feature folder | camelCase | `frontend/src/features/items/` |
| Shared schema files | camelCase + `.schema.ts` | `auth.schema.ts`, `common.schema.ts` |
| Test files | same name + `__tests__/` + `.test.ts` | `item.service.test.ts` |
| Prisma migrations | auto-generated | handled by Prisma |

## IDs and Keys

- All primary keys: UUID v4 (`@default(uuid())`) — NEVER auto-increment integers
- Cache keys: `scope:orgId:resource` or `scope:orgId:resource:id` (see skill-caching-patterns.md)
- Socket room names: `org:<orgId>` or `user:<userId>`
- BullMQ queue names: SCREAMING_SNAKE from `JobQueueName` enum

## NEVER do these

- NEVER abbreviate field names: `usrId` → `userId`, `orgId` is OK (established prefix)
- NEVER use `data`, `item`, `obj`, `temp` as variable names in production code
- NEVER use plural for Prisma model names (`Items` → `Item`)
- NEVER mix conventions in the same file
- NEVER use numbered suffixes: `Component2`, `helper3` — rename to describe purpose
