import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { env } from '../config/env.js';
import { verifyAccessToken, type AccessTokenPayload } from '../utils/tokens.js';
import { getUserScope } from './scope.js';
import { logger } from './logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// Realtime gateway (Socket.IO). Optional — gated by env.SOCKET_IO_ENABLED and
// wired up from server.ts (needs the raw http.Server, not the Express app, so
// it can't live in app.ts). Feature modules never import `socket.io` directly;
// they call the emit* helpers below, which are no-ops until initRealtime() has
// run (e.g. during `npm run test`, where the socket layer is never started).
//
// Auth: clients connect with `{ auth: { token: '<access token>' } }` (same JWT
// as the Bearer header used by REST — see middleware/auth.ts). On connect, the
// socket joins:
//   - `user:<id>`                    — private channel for that user
//   - `scope:all` (if scope.all)      — receives every zone/region/site event
//   - `region:<id>` / `zone:<id>` / `site:<id>` — one room per UserAccessScope row
// emitToZone/emitToRegion/emitToSite always also target `scope:all` so ALL-scope
// admins see every event regardless of which room raised it, mirroring the
// OR-based scope resolution in lib/scope.ts.
// ─────────────────────────────────────────────────────────────────────────────

interface SocketData {
  user: AccessTokenPayload;
}

type RealtimeServer = SocketIOServer<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  SocketData
>;
type RealtimeSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  SocketData
>;

let io: RealtimeServer | null = null;

function extractToken(socket: RealtimeSocket): string | undefined {
  const authToken = socket.handshake.auth?.token as string | undefined;
  if (authToken) return authToken;
  const header = socket.handshake.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
  return undefined;
}

export function initRealtime(httpServer: HttpServer): RealtimeServer {
  io = new SocketIOServer(httpServer, {
    path: '/socket.io',
    cors: { origin: env.FRONTEND_URL, credentials: true },
  });

  io.use((socket, next) => {
    try {
      const token = extractToken(socket as RealtimeSocket);
      if (!token) {
        next(new Error('UNAUTHORIZED'));
        return;
      }
      const payload = verifyAccessToken(token);
      (socket.data as SocketData).user = payload;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.sub}`);

    getUserScope(user.sub)
      .then((scope) => {
        if (scope.all) socket.join('scope:all');
        scope.regionIds.forEach((id) => socket.join(`region:${id}`));
        scope.zoneIds.forEach((id) => socket.join(`zone:${id}`));
        scope.siteIds.forEach((id) => socket.join(`site:${id}`));
      })
      .catch((err: unknown) => {
        logger.error('realtime: failed to resolve scope rooms', { error: String(err) });
      });

    logger.info('Realtime client connected', { userId: user.sub, socketId: socket.id });
    socket.on('disconnect', (reason) => {
      logger.info('Realtime client disconnected', {
        userId: user.sub,
        socketId: socket.id,
        reason,
      });
    });
  });

  logger.info('Realtime gateway initialized', { path: '/socket.io' });
  return io;
}

export function getIO(): RealtimeServer | null {
  return io;
}

/** True once initRealtime() has run — feature modules can use this to skip work. */
export function isRealtimeEnabled(): boolean {
  return io !== null;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToZone(zoneId: string, event: string, payload: unknown): void {
  io?.to(`zone:${zoneId}`).to('scope:all').emit(event, payload);
}

export function emitToRegion(regionId: string, event: string, payload: unknown): void {
  io?.to(`region:${regionId}`).to('scope:all').emit(event, payload);
}

export function emitToSite(siteId: string, event: string, payload: unknown): void {
  io?.to(`site:${siteId}`).to('scope:all').emit(event, payload);
}

export function broadcast(event: string, payload: unknown): void {
  // io.emit() (unlike BroadcastOperator.emit() returned by io.to(...)) is typed
  // directly off Server's own EmitEvents generic, which we deliberately keep as
  // `Record<string, never>` (no compile-time event map). socket.io's generic
  // overload then collapses the rest-args tuple to `never` for that call only.
  // Go through a structurally-typed cast (never touching `any`) rather than
  // widening the class's real event-map generics just for this one helper.
  const untyped = io as unknown as { emit(event: string, payload: unknown): boolean } | null;
  untyped?.emit(event, payload);
}
