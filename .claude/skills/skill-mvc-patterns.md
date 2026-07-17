# Skill — MVC Code Patterns

Read this when writing or reviewing any backend module. These are the exact patterns every service/controller/route must follow.

---

## Controller pattern (always thin)

```typescript
// ✅ CORRECT — controller is a pass-through
static async create(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await MyService.create(req.body, req.user);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
}

// ❌ WRONG — controller has business logic
static async create(req: Request, res: Response, next: NextFunction) {
  const exists = await prisma.thing.findFirst({ where: { name: req.body.name } });
  if (exists) return res.status(409).json({ success: false, error: { code: 'CONFLICT' } });
  // ^ This belongs in the service
}
```

## Service guard pattern (always check before write)

```typescript
// ✅ CORRECT — guard then write in transaction
static async create(dto: CreateInput, actor: AuthUser) {
  const existing = await prisma.thing.findFirst({
    where: { name: dto.name, organizationId: actor.organizationId, deletedAt: null },
  });
  if (existing) throw new ConflictError('Already exists');

  return prisma.$transaction(async (tx) => {
    const record = await tx.thing.create({ data: { ...dto, organizationId: actor.organizationId } });
    await auditLogger.log(tx, { action: 'THING_CREATED', entity: 'Thing', entityId: record.id, actorId: actor.id, organizationId: actor.organizationId });
    return record;
  });
}
```

## List with pagination (mandatory pattern)

```typescript
static async list(query: ListQuery, actor: AuthUser) {
  const { page = 1, limit = 20 } = query;
  const where = { organizationId: actor.organizationId, deletedAt: null };
  const [data, total] = await prisma.$transaction([
    prisma.thing.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.thing.count({ where }),
  ]);
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
```

## Soft delete (never hard delete)

```typescript
// ✅ CORRECT
await tx.thing.update({ where: { id }, data: { deletedAt: new Date() } });

// ❌ WRONG
await prisma.thing.delete({ where: { id } });
```

## AppError subclasses (throw these, not raw Error)

```typescript
throw new NotFoundError('Thing not found');         // 404
throw new ConflictError('Already exists');           // 409
throw new ForbiddenError('Not authorized');          // 403
throw new ValidationError('Invalid input');          // 400
throw new AppError('Something went wrong', 500);    // custom
```

## Middleware chain (EXACT order, no deviation)

```typescript
router.post(
  '/',
  authenticate,                              // 1. verify JWT → set req.user
  requirePermission('things', 'create'),     // 2. RBAC check — register 'things' in shared/src/permissions.ts FIRST
  validateRequest({ body: CreateSchema }),   // 3. Zod parse → req.body typed
  ThingController.create,                    // 4. thin controller
);
```

---

## Full controller template (paste-able)

```typescript
// <name>.controller.ts — THIN: parse → service → respond
import type { Request, Response, NextFunction } from 'express';
import { ItemService } from './item.service.js';
import type { CreateItemInput } from './item.validation.js';

export class ItemController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await ItemService.create(
        req.body as CreateItemInput,
        req.user,
      );
      res.status(201).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ItemService.list(req.query, req.user);
      res.json({ success: true, data: result.data, meta: result.meta });
    } catch (err) {
      next(err);
    }
  }

  static async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await ItemService.getOne(req.params.id, req.user);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await ItemService.update(req.params.id, req.body, req.user);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await ItemService.remove(req.params.id, req.user);
      res.json({ success: true, data: null });
    } catch (err) {
      next(err);
    }
  }
}
```

---

## Full service template (paste-able)

```typescript
// <name>.service.ts — THICK: all logic, all DB, all side effects
import { prisma } from '../../lib/prisma.js';
import { auditLogger } from '../../utils/auditLogger.js';
import { emailQueue } from '../../jobs/queues.js';
import { ConflictError, NotFoundError } from '../../middleware/errorHandler.js';
import type { AuthUser } from '@boilerplate/shared';
import type { CreateItemInput, UpdateItemInput, ListItemQuery } from './item.validation.js';

export class ItemService {
  static async create(dto: CreateItemInput, actor: AuthUser) {
    // 1. Guard: check uniqueness
    const existing = await prisma.item.findFirst({
      where: { email: dto.email, organizationId: actor.organizationId, deletedAt: null },
    });
    if (existing) throw new ConflictError('An item with this email already exists');

    // 2. Write in a transaction
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.item.create({
        data: { ...dto, organizationId: actor.organizationId },
      });
      await auditLogger.log(tx, {
        action: 'ITEM_CREATED',
        entity: 'Item',
        entityId: created.id,
        actorId: actor.id,
        organizationId: actor.organizationId,
        after: created,
      });
      return created;
    });

    // 3. Side effects outside the transaction
    await emailQueue.add('welcome-item', { itemId: item.id });

    return item;
  }

  static async list(query: ListItemQuery, actor: AuthUser) {
    const { page = 1, limit = 20 } = query;
    const where = { organizationId: actor.organizationId, deletedAt: null };

    const [data, total] = await prisma.$transaction([
      prisma.item.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.item.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  static async getOne(id: string, actor: AuthUser) {
    const item = await prisma.item.findFirst({
      where: { id, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!item) throw new NotFoundError('Item not found');
    return item;
  }

  static async update(id: string, dto: UpdateItemInput, actor: AuthUser) {
    const item = await this.getOne(id, actor); // re-uses guard above

    return prisma.$transaction(async (tx) => {
      const updated = await tx.item.update({
        where: { id },
        data: dto,
      });
      await auditLogger.log(tx, {
        action: 'ITEM_UPDATED',
        entity: 'Item',
        entityId: id,
        actorId: actor.id,
        organizationId: actor.organizationId,
        before: item,
        after: updated,
      });
      return updated;
    });
  }

  static async remove(id: string, actor: AuthUser) {
    await this.getOne(id, actor);

    await prisma.$transaction(async (tx) => {
      await tx.item.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await auditLogger.log(tx, {
        action: 'ITEM_DELETED',
        entity: 'Item',
        entityId: id,
        actorId: actor.id,
        organizationId: actor.organizationId,
      });
    });
  }
}
```

---

## Full validation template (paste-able)

```typescript
// <name>.validation.ts — Zod schemas imported from shared OR defined here
import { z } from 'zod';
import { PaginationSchema } from '@boilerplate/shared';

export const CreateItemSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  categoryId: z.string().uuid(),
});

export const UpdateItemSchema = CreateItemSchema.partial();

export const ListItemQuerySchema = PaginationSchema.extend({
  categoryId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export type CreateItemInput = z.infer<typeof CreateItemSchema>;
export type UpdateItemInput = z.infer<typeof UpdateItemSchema>;
export type ListItemQuery = z.infer<typeof ListItemQuerySchema>;
```

---

## Full routes template (paste-able)

```typescript
// <name>.routes.ts — wire middleware chain
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../middleware/auth.middleware.js';
import { validateRequest } from '../../middleware/validation.js';
import { ItemController } from './item.controller.js';
import {
  CreateItemSchema,
  UpdateItemSchema,
  ListItemQuerySchema,
} from './item.validation.js';

export const itemRouter = Router();

itemRouter.get(
  '/',
  authenticate,
  requirePermission('items', 'read'),
  validateRequest({ query: ListItemQuerySchema }),
  ItemController.list,
);

itemRouter.post(
  '/',
  authenticate,
  requirePermission('items', 'create'),
  validateRequest({ body: CreateItemSchema }),
  ItemController.create,
);

itemRouter.get(
  '/:id',
  authenticate,
  requirePermission('items', 'read'),
  validateRequest({ params: z.object({ id: z.string().uuid() }) }),
  ItemController.getOne,
);

itemRouter.patch(
  '/:id',
  authenticate,
  requirePermission('items', 'update'),
  validateRequest({ params: z.object({ id: z.string().uuid() }), body: UpdateItemSchema }),
  ItemController.update,
);

itemRouter.delete(
  '/:id',
  authenticate,
  requirePermission('items', 'delete'),
  validateRequest({ params: z.object({ id: z.string().uuid() }) }),
  ItemController.remove,
);
```
