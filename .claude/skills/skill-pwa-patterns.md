# Skill — PWA Patterns (Operator Dashboard)

Aniston VMS's `apps/web` (React + Vite) is the control-room web app operators use to watch the
live wall, triage incidents and manage cameras across ~125 sites. This skill covers making it
installable and usable on a flaky link (control-room PC, or a supervisor's tablet/phone): manifest,
service worker caching strategy, offline fallback, install prompt, and push notifications for
incident/escalation alerts. Canon: `docs/tech-stack-targets.md` (PWA is retained/deferred scope —
the primary target is the web SPA; do not block Stages 1–10 work on this) and `docs/02-TRD.md §12`
(self-monitoring/alerts) for what a push notification actually represents.

---

## Vite PWA config (`apps/web/vite.config.ts`)

```typescript
import { VitePWA } from 'vite-plugin-pwa';

VitePWA({
  registerType: 'prompt',        // never auto-reload a control-room tab mid-incident
  injectRegister: 'auto',
  strategies: 'injectManifest',  // custom sw.ts — we need fine-grained caching per route
  srcDir: 'src',
  filename: 'sw.ts',
  manifest: {
    name: 'Aniston VMS',
    short_name: 'Aniston VMS',
    description: 'Aniston VMS — CCTV monitoring & incident management for the camera fleet',
    theme_color: '#0073ea',
    background_color: '#ffffff',
    display: 'standalone',
    start_url: '/',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  devOptions: { enabled: false },
});
```

`registerType: 'prompt'` (not `'autoUpdate'`) is deliberate: a background auto-reload while an
operator is scrubbing playback or acknowledging an incident would drop their place. Use the
update-prompt UI below instead.

---

## Service worker (`apps/web/src/sw.ts`)

Workbox `injectManifest` mode — precache the app shell, then hand-pick runtime strategies per
route. **Never cache live video** (`/{path}/whep`, `/{path}/index.m3u8` from MediaMTX, or
`/api/cameras/:id/live/*`) — streams must always hit the network.

```typescript
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, CacheOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Dashboard/API reads (incidents, cameras, zones) — fresh when online, stale-but-usable offline
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/incidents') || url.pathname.startsWith('/api/cameras'),
  new NetworkFirst({
    cacheName: 'vms-api-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 })],
  }),
);

// Camera snapshots/thumbnails — safe to cache a bit longer, they're stills not live streams
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/cameras') && url.pathname.endsWith('/snapshot'),
  new CacheFirst({
    cacheName: 'vms-snapshot-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 300 })],
  }),
);

// Never cache live/playback stream endpoints
registerRoute(({ url }) => /\/(whep|index\.m3u8)$/.test(url.pathname), new CacheOnly());

const bgSyncPlugin = new BackgroundSyncPlugin('incident-ack-queue', { maxRetentionTime: 24 * 60 });
registerRoute(
  ({ url, request }) => url.pathname.match(/\/api\/incidents\/.*\/(ack|resolve)$/) && request.method === 'POST',
  new NetworkFirst({ plugins: [bgSyncPlugin] }),
  'POST',
);

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Aniston VMS alert', {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: { url: data.url ?? '/incidents' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/incidents';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      const existing = clientList.find((c) => c.url.includes(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    }),
  );
});
```

If offline, the SPA falls back to `apps/web/public/offline.html` (a static "Reconnecting to
Aniston VMS…" page) — no cached React bundle can safely render live camera state, so keep this
fallback minimal and honest about what's stale.

---

## Update prompt (`apps/web/src/components/PwaUpdatePrompt.tsx`)

```typescript
import { useRegisterSW } from 'virtual:pwa-register/react';

export function PwaUpdatePrompt() {
  const { needRefresh, updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[9999] rounded-[var(--card-radius)] bg-white p-4 shadow-lg">
      <p className="text-sm">A new version of Aniston VMS is available.</p>
      <button className="btn-primary-sm mt-2" onClick={() => updateServiceWorker(true)}>
        Reload now
      </button>
    </div>
  );
}
```

## Install prompt (`apps/web/src/hooks/usePwaInstall.ts`)

```typescript
import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePwaInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const promptInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setCanInstall(false);
  };

  return { canInstall, promptInstall };
}
```

Useful on a supervisor's tablet mounted next to the video wall — installs Aniston VMS as a
standalone app so it isn't lost among browser tabs.

## Online status (`apps/web/src/hooks/useOnlineStatus.ts`)

```typescript
import { useEffect, useState } from 'react';

export function useOnlineStatus() {
  const [isOnline, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return isOnline;
}
```

Drive an `<OfflineBanner />` from this — an operator needs to know *their browser* lost the
network, as distinct from a camera/site going offline (that's an `Incident`, not a connectivity
banner).

---

## Push notifications (incident/escalation)

Push delivers the same incident/escalation events that also go out over WhatsApp Cloud API and
email (SES) — see `skill-email-patterns.md` and `skill-notification-patterns.md`. It's an
additional channel, not a replacement: `NotificationStatus` tracks delivery per channel.

```typescript
// apps/web/src/hooks/usePushNotifications.ts
import { useSubscribePushMutation } from '@/features/notifications/notificationsApi';

export async function requestAndSubscribe(registration: ServiceWorkerRegistration) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
  });
  return subscription;
}
```

```typescript
// apps/api/src/notifications/push.controller.ts (NestJS) — @Post('subscribe') → POST /api/push/subscribe
// Persists { userId, organizationId, endpoint, keys } via Prisma — scoped like every other query
// (see skill-prisma-patterns.md: organizationId + deletedAt: null on every read).
```

The `apps/workers` BullMQ notification worker that fans out incident/escalation events (see
`skill-notification-patterns.md`) calls `webpush.sendNotification(subscription, payload)` for
every stored subscription belonging to users with visibility on the affected zone/site.

---

## Checklist before shipping a PWA change

- [ ] Manifest `name`/`short_name`/`description` say **Aniston VMS**, not the boilerplate strings
- [ ] Live stream endpoints (`whep`, `index.m3u8`, `/live/*`) are never cached
- [ ] `registerType: 'prompt'` preserved — no silent reload during an active incident review
- [ ] Offline banner clearly distinguishes "your browser is offline" from a camera/site incident
- [ ] Push payload includes a `url` so `notificationclick` deep-links to the right incident
- [ ] Icons exist at all four declared sizes/purposes in `apps/web/public/`
- [ ] Lighthouse PWA score ≥ 90/100 on `apps/web/dist` before merging
