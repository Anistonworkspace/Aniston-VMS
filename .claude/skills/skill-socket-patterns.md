# Skill — Socket.io Real-Time Patterns

Use this skill whenever a feature needs live UI updates without page refresh.

---

## Architecture overview

```
Service layer emits → Socket.io server → authenticated room → frontend listener
                                                              ↓
                                                  RTK Query cache invalidation
                                                              ↓
                                                     UI re-renders instantly
```

---

## Backend — Server setup (already done in boilerplate)

```typescript
// backend/src/sockets/index.ts — already wired, DO NOT recreate
import { Server } from 'socket.io';
import { verifyToken } from '../utils/jwt.js';

export function initSockets(io: Server) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    const payload = verifyToken(token);
    socket.data.user = payload;
    next();
  });

  io.on('connection', (socket) => {
    const { id, organizationId } = socket.data.user;

    // Join org room (all org users get org-wide events)
    socket.join(`org:${organizationId}`);
    // Join personal room (targeted events to one user)
    socket.join(`user:${id}`);

    socket.on('disconnect', () => {
      socket.leave(`org:${organizationId}`);
      socket.leave(`user:${id}`);
    });
  });
}
```

---

## Backend — Emit from a service

**RULE: Socket emits go in the service layer, AFTER the transaction commits. Never inside the transaction block.**

```typescript
// In any service method, import io from the socket singleton
import { getIO } from '../../lib/socket.js';

// ── Pattern 1: Emit to entire organization ──────────────────────────────────
export class ItemService {
  static async approve(id: string, actor: AuthUser) {
    const updated = await prisma.$transaction(async (tx) => {
      const rows = await tx.item.updateMany({
        where: { id, organizationId: actor.organizationId, status: 'SUBMITTED' },
        data: { status: 'APPROVED', approverId: actor.id },
      });
      if (rows.count === 0) throw new ConflictError('Already processed or not found');

      await auditLogger.log(tx, { action: 'ITEM_APPROVED', entityId: id, actorId: actor.id, organizationId: actor.organizationId });
      return tx.item.findUniqueOrThrow({ where: { id } });
    });

    // Emit AFTER transaction — to whole org
    getIO().to(`org:${actor.organizationId}`).emit('item:updated', {
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt,
    });

    return updated;
  }

  // ── Pattern 2: Emit to a specific user only ────────────────────────────────
  static async notifyUser(userId: string, payload: object) {
    getIO().to(`user:${userId}`).emit('notification:new', payload);
  }
}
```

---

## Backend — Socket singleton (already in boilerplate)

```typescript
// backend/src/lib/socket.ts
import type { Server } from 'socket.io';
let _io: Server;
export const setIO = (io: Server) => { _io = io; };
export const getIO = () => {
  if (!_io) throw new Error('Socket.io not initialized');
  return _io;
};
```

---

## Typed event catalog — define in shared/

```typescript
// shared/src/socket-events.ts
export const SOCKET_EVENTS = {
  // Item module
  ITEM_UPDATED:       'item:updated',
  ITEM_CREATED:       'item:created',

  // Notification
  NOTIFICATION_NEW:   'notification:new',
  NOTIFICATION_READ:  'notification:read',

  // Category
  CATEGORY_UPDATED:   'category:updated',

  // System
  FORCE_LOGOUT:       'system:force-logout',   // revoke a user's session
} as const;

export type SocketEvent = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];
```

---

## Frontend — Socket client (already in boilerplate)

```typescript
// frontend/src/lib/socket.ts — already set up
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket;

  socket = io(import.meta.env.VITE_API_URL, {
    auth: { token },
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] connect error:', err.message);
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null { return socket; }
```

---

## Frontend — Listen and invalidate RTK Query cache

**This is the most important pattern.** Listen for events and invalidate the relevant RTK Query tags so the UI auto-refreshes without any user action.

```typescript
// frontend/src/features/item/useItemSocketSync.ts
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { itemApi } from './itemApi';
import { getSocket } from '@/lib/socket';
import { SOCKET_EVENTS } from '@boilerplate/shared';

export function useItemSocketSync() {
  const dispatch = useDispatch();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleItemUpdated = () => {
      // This invalidates the 'Item' tag — all list/detail queries refetch
      dispatch(itemApi.util.invalidateTags(['Item']));
    };

    socket.on(SOCKET_EVENTS.ITEM_UPDATED, handleItemUpdated);
    socket.on(SOCKET_EVENTS.ITEM_CREATED, handleItemUpdated);

    return () => {
      socket.off(SOCKET_EVENTS.ITEM_UPDATED, handleItemUpdated);
      socket.off(SOCKET_EVENTS.ITEM_CREATED, handleItemUpdated);
    };
  }, [dispatch]);
}
```

```typescript
// Use the hook in the page component that shows the list
export function ItemPage() {
  useItemSocketSync();   // add this one line — socket sync is now active
  const { data, isLoading } = useGetItemsQuery();
  // ...
}
```

---

## Frontend — Connect socket after login, disconnect on logout

```typescript
// frontend/src/features/auth/authSlice.ts — update the login/logout thunks
import { connectSocket, disconnectSocket } from '@/lib/socket';

// In the login fulfilled case:
builder.addCase(loginThunk.fulfilled, (state, action) => {
  state.user = action.payload.user;
  state.token = action.payload.token;
  connectSocket(action.payload.token);  // ← connect here
});

// In the logout case:
builder.addCase(logoutThunk.fulfilled, (state) => {
  state.user = null;
  state.token = null;
  disconnectSocket();  // ← disconnect here
});
```

---

## Frontend — Connection status indicator (optional)

```typescript
// hooks/useSocketStatus.ts
import { useState, useEffect } from 'react';
import { getSocket } from '@/lib/socket';

export function useSocketStatus() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onConnect    = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    setConnected(socket.connected);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return connected;
}
```

---

## Checklist before shipping any real-time feature

- [ ] Event name defined in `shared/src/socket-events.ts` (typed, not a raw string)
- [ ] Emit is AFTER the `prisma.$transaction` block (not inside it)
- [ ] Emit targets the correct room (`org:` vs `user:`)
- [ ] Payload contains only what the frontend needs (no sensitive fields)
- [ ] Frontend hook cleans up listeners in the `return` of `useEffect`
- [ ] RTK Query cache is invalidated by the listener (not just console.log)
- [ ] Socket connected on login, disconnected on logout
- [ ] Test: two browser tabs — action in tab 1 → tab 2 updates without refresh

## Anti-patterns

```typescript
// ❌ Emitting inside a transaction — socket fires even if DB rolls back
await prisma.$transaction(async (tx) => {
  await tx.item.update({ ... });
  getIO().emit('item:updated', ...);  // WRONG — outside only
});

// ❌ Raw string event names — typo risk, no autocomplete
socket.emit('itemUpdated', ...);       // WRONG

// ❌ Not cleaning up listeners — causes memory leaks and double-fires
useEffect(() => {
  socket.on('item:updated', handler);
  // missing return () => socket.off(...)  ← WRONG
}, []);
```
