# Skill — Socket.io Real-Time Patterns (NestJS)

Use this skill whenever a feature needs live UI updates without a page refresh (Incident Kanban board, camera health tiles, notification toasts, NOC connection status). Real-time in Aniston VMS is a NestJS `@WebSocketGateway` living in `apps/api`, backed by socket.io, with a Redis adapter so events fan out across every API instance.

> Canon: `docs/03-app-flow.md` (real-time UX expectations) and `docs/02-TRD.md` §6.5 (escalation worker) are the source of truth for *when* events should fire; `docs/05-backend-schema.md` has the full Prisma models; `memory/alignment-dictionary.md` + `CLAUDE.md` fix the module/path names (`apps/api`, `apps/workers`, `packages/shared`). Skim, don't re-derive. This skill only covers the gateway wiring/patterns.

---

## Architecture overview

```
Gateway emits → socket.io server → scope-guarded room → frontend listener
                                                            ↓
                                                RTK Query cache invalidation
                                                            ↓
                                                   UI re-renders instantly
```

Aniston VMS is not single-tenant, so there is no `org:` room. Access is governed by the `Region → Zone → Site → Camera` hierarchy and each user's `UserAccessScope` rows (resolved by `ScopeService` in `apps/api/src/scope/scope.service.ts` — the same resolver REST queries use). Rooms must mirror that scope, or a viewer scoped to one site will receive events for incidents/cameras they can't see.

---

## Backend — the gateway

The gateway is a first-class NestJS provider: it authenticates the handshake with the same `JwtService` the HTTP guards use, resolves scope with the same `ScopeService`, and joins one room per scope grant. Don't invent a parallel authorization path for sockets.

```typescript
// apps/api/src/realtime/realtime.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { ScopeService } from '../scope/scope.service';
import { SOCKET_EVENTS, type SocketEvent, type AuthUser } from '@aniston-vms/shared';

@WebSocketGateway({
  cors: { origin: process.env.WEB_ORIGIN, credentials: true },
  // No namespace: a single default namespace — the rooms below carry the scoping.
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer() private readonly server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly scope: ScopeService,
  ) {}

  // ── Handshake auth — reuse the HTTP access-token verifier, never a second path ──
  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (!token) throw new Error('Missing token');

      const payload = await this.jwt.verifyAsync(token, { secret: process.env.JWT_SECRET });
      const user: AuthUser = {
        id: payload.sub,
        role: payload.role,
        email: payload.email,
        organizationId: payload.organizationId,
      };
      client.data.user = user;

      // Join every room this user is allowed to see, mirroring ScopeService.
      const scope = await this.scope.getUserScope(user.id);
      if (scope.all) {
        client.join('scope:all');
      } else {
        scope.regionIds.forEach((regionId) => client.join(`region:${regionId}`));
        scope.zoneIds.forEach((zoneId) => client.join(`zone:${zoneId}`));
        scope.siteIds.forEach((siteId) => client.join(`site:${siteId}`));
      }
      // Always join a personal room for targeted notifications / force-logout.
      client.join(`user:${user.id}`);

      this.logger.log(`Socket connected user=${user.id} scopeAll=${scope.all}`);
    } catch (err) {
      client.emit('connect_error', (err as Error).message);
      client.disconnect(true); // reject unauthenticated / unscoped sockets
    }
  }

  handleDisconnect(_client: Socket) {
    // socket.io leaves all joined rooms automatically on disconnect —
    // no manual client.leave(...) bookkeeping needed here.
  }

  // ── Helpers used by services (call AFTER the DB transaction commits) ──────
  emitToScope(room: string, event: SocketEvent, payload: unknown): void {
    this.server.to(room).emit(event, payload);
  }

  emitToUser(userId: string, event: SocketEvent, payload: unknown): void {
    this.server.to(`user:${userId}`).emit(event, payload);
  }
}
```

The `NotificationsGateway` referenced in `skill-notification-patterns.md` is this same pattern: a feature module either injects `RealtimeGateway` directly or exposes a thin gateway that delegates to `emitToUser`. There is exactly one authenticated socket per client — don't stand up a second gateway with its own auth.

---

## Backend — Redis adapter for horizontal scaling

Multiple `apps/api` replicas each hold their own socket connections, so a plain in-memory server can only reach clients on the same instance. Wire socket.io through the shared Redis (`REDIS_URL`) with `@socket.io/redis-adapter` so an emit on any replica reaches every scoped client.

```typescript
// apps/api/src/realtime/redis-io.adapter.ts
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { INestApplicationContext } from '@nestjs/common';
import type { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor!: ReturnType<typeof createAdapter>;

  constructor(private readonly context: INestApplicationContext) {
    super(context);
  }

  async connect(): Promise<void> {
    const pub = createClient({ url: process.env.REDIS_URL });
    const sub = pub.duplicate();
    await Promise.all([pub.connect(), sub.connect()]);
    this.adapterConstructor = createAdapter(pub, sub);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
```

```typescript
// apps/api/src/main.ts — register the adapter before app.listen()
const redisIoAdapter = new RedisIoAdapter(app);
await redisIoAdapter.connect();
app.useWebSocketAdapter(redisIoAdapter);
```

---

## Backend — emit from a service

**RULE: socket emits go in the service layer, AFTER the `prisma.$transaction` commits and AFTER the audit row is written. Never inside the transaction block.** If the transaction rolls back, a listener must never have already seen the change; if the emit fired before the audit record, the timeline would show an event nobody can trace.

```typescript
// apps/api/src/modules/incidents/incidents.service.ts
import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { AuditLogger } from '../../audit/audit-logger.service';
import { SOCKET_EVENTS, type AuthUser } from '@aniston-vms/shared';

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly audit: AuditLogger,
  ) {}

  // ── Pattern 1: emit to every viewer scoped to this incident's zone ─────────
  async acknowledge(incidentId: string, actor: AuthUser) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const incident = await tx.incident.findUniqueOrThrow({ where: { id: incidentId } });
      if (incident.acknowledgedAt) throw new ConflictException('Already acknowledged');

      return tx.incident.update({
        where: { id: incidentId },
        data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
      });
    });

    // Audit path: record who did what BEFORE the emit, so every live change is traceable.
    await this.audit.record(actor, {
      action: 'incident.acknowledge',
      entityType: 'Incident',
      entityId: incidentId,
      newValue: { status: updated.status, acknowledgedAt: updated.acknowledgedAt },
    });

    // Emit AFTER commit + audit — scoped to the incident's zone, never a global broadcast.
    this.realtime.emitToScope(`zone:${updated.zoneId}`, SOCKET_EVENTS.INCIDENT_UPDATED, {
      id: updated.id,
      status: updated.status,
      severity: updated.severity,
      acknowledgedAt: updated.acknowledgedAt,
    });

    return updated;
  }

  // ── Pattern 2: emit to a specific user only (assigned engineer's toast) ────
  notifyAssignee(userId: string, payload: { incidentId: string; message: string }) {
    this.realtime.emitToUser(userId, SOCKET_EVENTS.NOTIFICATION_NEW, payload);
  }
}
```

The same after-commit rule applies to the escalation processor in `apps/workers`: once the BullMQ escalation job writes the `ESCALATED` `IncidentEvent` row, it emits `SOCKET_EVENTS.INCIDENT_ESCALATED` to `zone:${inc.zoneId}` right after — the escalation ladder timer must not be blocked by the emit. Because `apps/workers` is a separate process that holds no client sockets, it emits into the same rooms via `@socket.io/redis-emitter` (pointed at the same `REDIS_URL`) rather than injecting the gateway's HTTP server.

---

## Typed event catalog — define in `packages/shared`

`packages/shared/src/enums.ts` already mirrors `prisma/schema.prisma` and is imported by both apps without pulling in the generated Prisma client — put the socket contract next to it, not inside either app. Event names are kept consistent with `skill-notification-patterns.md`'s event catalog.

```typescript
// packages/shared/src/socket-events.ts — export it from packages/shared/src/index.ts
export const SOCKET_EVENTS = {
  // Incidents (apps/api/src/modules/incidents)
  INCIDENT_CREATED:   'incident:created',
  INCIDENT_UPDATED:   'incident:updated',   // ack / assign / status change / close
  INCIDENT_ESCALATED: 'incident:escalated',
  INCIDENT_RESOLVED:  'incident:resolved',

  // Cameras (health/diagnostic pipeline — see CameraStatus in packages/shared/src/enums.ts)
  CAMERA_STATUS_CHANGED: 'camera:status-changed',

  // Notifications (bell icon — delivered by the NotificationsGateway, see skill-notification-patterns.md)
  NOTIFICATION_NEW:      'notification:new',
  NOTIFICATION_READ:     'notification:read',
  NOTIFICATION_ALL_READ: 'notification:all-read',

  // System
  FORCE_LOGOUT: 'system:force-logout',   // revoke a user's session on role/scope change
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
```

---

## Frontend — socket client

```typescript
// frontend/src/lib/socket.ts
import { io, type Socket } from 'socket.io-client';

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

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}
```

---

## Frontend — listen and invalidate RTK Query cache

**This is the most important pattern.** Listen for gateway events and invalidate the relevant RTK Query tags so the Incident Kanban and camera health tiles auto-refresh without any user action. A camera status change touches an incident's context, so this hook invalidates **both** the `Incident` and `Camera` tags.

```typescript
// frontend/src/features/incidents/useIncidentSocketSync.ts
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { incidentApi } from './incidentApi';
import { cameraApi } from '@/features/cameras/cameraApi';
import { getSocket } from '@/lib/socket';
import { SOCKET_EVENTS } from '@aniston-vms/shared';

export function useIncidentSocketSync() {
  const dispatch = useDispatch();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Incident lifecycle → refetch the Kanban list + detail queries.
    const onIncidentChanged = () => {
      dispatch(incidentApi.util.invalidateTags(['Incident']));
    };
    // Camera health flips can open/close incidents → refresh both tag sets.
    const onCameraChanged = () => {
      dispatch(cameraApi.util.invalidateTags(['Camera']));
      dispatch(incidentApi.util.invalidateTags(['Incident']));
    };

    socket.on(SOCKET_EVENTS.INCIDENT_CREATED,      onIncidentChanged);
    socket.on(SOCKET_EVENTS.INCIDENT_UPDATED,      onIncidentChanged);
    socket.on(SOCKET_EVENTS.INCIDENT_ESCALATED,    onIncidentChanged);
    socket.on(SOCKET_EVENTS.INCIDENT_RESOLVED,     onIncidentChanged);
    socket.on(SOCKET_EVENTS.CAMERA_STATUS_CHANGED, onCameraChanged);

    return () => {
      socket.off(SOCKET_EVENTS.INCIDENT_CREATED,      onIncidentChanged);
      socket.off(SOCKET_EVENTS.INCIDENT_UPDATED,      onIncidentChanged);
      socket.off(SOCKET_EVENTS.INCIDENT_ESCALATED,    onIncidentChanged);
      socket.off(SOCKET_EVENTS.INCIDENT_RESOLVED,     onIncidentChanged);
      socket.off(SOCKET_EVENTS.CAMERA_STATUS_CHANGED, onCameraChanged);
    };
  }, [dispatch]);
}
```

```typescript
// Use the hook in the page component that shows the board
export function IncidentKanban() {
  useIncidentSocketSync();   // add this one line — socket sync is now active
  const { data, isLoading } = useGetIncidentsQuery();
  // ...
}
```

---

## Frontend — connect socket after login, disconnect on logout

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

## Frontend — connection status indicator (optional)

Useful on the NOC dashboard top bar — operators need to know if they've silently gone stale during an active incident.

```typescript
// frontend/src/features/platform/usePlatformSocketStatus.ts
import { useState, useEffect } from 'react';
import { getSocket } from '@/lib/socket';

export function usePlatformSocketStatus() {
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

- [ ] Event name defined in `packages/shared/src/socket-events.ts` (typed, not a raw string)
- [ ] Handshake auth reuses `JwtService` + `ScopeService` — no parallel socket auth path
- [ ] Emit is AFTER the `prisma.$transaction` block AND after the audit row is written (not inside the tx)
- [ ] Emit targets the correct scoped room (`zone:` / `site:` / `region:` / `scope:all` / `user:`) — never a bare global broadcast
- [ ] Payload contains only what the frontend needs (no encrypted credentials, no full audit trail)
- [ ] Frontend hook cleans up listeners in the `return` of `useEffect`
- [ ] RTK Query cache is invalidated by the listener (Incident and/or Camera tags) — not just `console.log`
- [ ] `RedisIoAdapter` is registered in `main.ts` so emits reach clients on every `apps/api` replica
- [ ] `apps/workers` escalation emits go through `@socket.io/redis-emitter`, not a second gateway
- [ ] Socket connected on login, disconnected on logout
- [ ] Test: two browser tabs, two different scopes — an action in tab 1 only reaches tab 2 if tab 2's user can actually see that zone/site

## Anti-patterns

```typescript
// ❌ Emitting inside a transaction — socket fires even if the DB rolls back
await this.prisma.$transaction(async (tx) => {
  await tx.incident.update({ /* ... */ });
  this.realtime.emitToScope('scope:all', SOCKET_EVENTS.INCIDENT_UPDATED, /* ... */); // WRONG — emit outside only
});

// ❌ Broadcasting to every connected socket regardless of scope
this.server.emit('incident:updated', payload);   // WRONG — leaks cross-site data to viewers

// ❌ Raw string event names — typo risk, no autocomplete, drifts from the shared catalog
socket.emit('incidentUpdated', payload);   // WRONG

// ❌ A second gateway with its own JWT handling instead of reusing JwtService + ScopeService
@WebSocketGateway({ namespace: 'cameras' })  // WRONG — parallel auth path, scope drift

// ❌ Not cleaning up listeners — causes memory leaks and double-fires
useEffect(() => {
  socket.on(SOCKET_EVENTS.INCIDENT_UPDATED, handler);
  // missing return () => socket.off(...)  ← WRONG
}, []);
```
