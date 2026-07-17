# Skill — PWA Patterns

Workbox cache strategies, offline data sync, install prompt, push notifications, background sync.

---

## Vite PWA config (workbox injectManifest)

```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies:    'injectManifest',
      srcDir:        'src',
      filename:      'sw.ts',
      registerType:  'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name:             'Boilerplate App',
        short_name:       'BPApp',
        description:      'Enterprise HR Management',
        theme_color:      '#0073ea',
        background_color: '#f1ece3',
        display:          'standalone',
        orientation:      'portrait',
        start_url:        '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        screenshots: [
          { src: '/screenshots/desktop.png', sizes: '1280x800', type: 'image/png', form_factor: 'wide' },
          { src: '/screenshots/mobile.png',  sizes: '390x844',  type: 'image/png', form_factor: 'narrow' },
        ],
      },
    }),
  ],
});
```

---

## Service worker (src/sw.ts)

```typescript
// src/sw.ts — compiled by Workbox injectManifest
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

declare let self: ServiceWorkerGlobalScope;

// Precache all assets injected by Vite
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// API calls — NetworkFirst (always try network, fall back to cache)
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 5 * 60 }),
    ],
  }),
);

// Static assets — CacheFirst (serve from cache, update in background)
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  }),
);

// Google Fonts — StaleWhileRevalidate
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new StaleWhileRevalidate({ cacheName: 'google-fonts' }),
);

// Background sync for offline form submissions
const bgSyncPlugin = new BackgroundSyncPlugin('offline-queue', {
  maxRetentionTime: 24 * 60,   // retry for 24 hours
});

registerRoute(
  ({ url, request }) => url.pathname.startsWith('/api/') && request.method === 'POST',
  new NetworkFirst({
    cacheName: 'api-post-cache',
    plugins: [bgSyncPlugin],
  }),
  'POST',
);

// Push notification handler
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Notification', {
      body:  data.body,
      icon:  '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data:  { url: data.url ?? '/' },
    }),
  );
});

// Notification click — open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      const url = event.notification.data.url;
      const existing = clientList.find(c => c.url.includes(url) && 'focus' in c);
      if (existing) return existing.focus();
      return clients.openWindow(url);
    }),
  );
});
```

---

## Install prompt hook

```typescript
// frontend/src/hooks/usePwaInstall.ts
import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePwaInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled,   setIsInstalled]   = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Detect if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setIsInstalled(true);
      setInstallPrompt(null);
    }
  };

  return { canInstall: !!installPrompt && !isInstalled, isInstalled, install };
}

// Usage in header/banner:
function InstallBanner() {
  const { canInstall, install } = usePwaInstall();
  if (!canInstall) return null;

  return (
    <div className="floating-card rounded-[var(--card-radius)] p-3 flex items-center gap-3 mb-4">
      <span className="text-sm">Install the app for offline access</span>
      <button className="btn btn--primary btn--sm" onClick={install}>Install</button>
    </div>
  );
}
```

---

## Push notification subscription

```typescript
// frontend/src/hooks/usePushNotifications.ts
export function usePushNotifications() {
  const [subscribePush] = useSubscribePushMutation();

  const subscribe = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return;    // already subscribed

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: process.env.VITE_VAPID_PUBLIC_KEY,
    });

    await subscribePush(sub).unwrap();
    toast.success('Push notifications enabled');
  };

  const requestAndSubscribe = async () => {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') await subscribe();
  };

  return { requestAndSubscribe };
}

// Backend — save subscription
// POST /api/push/subscribe
static async savePushSubscription(sub: PushSubscription, actor: AuthUser) {
  await prisma.pushSubscription.upsert({
    where:  { endpoint: sub.endpoint },
    update: { keys: sub.keys, userId: actor.id },
    create: { endpoint: sub.endpoint, keys: sub.keys, userId: actor.id, organizationId: actor.organizationId },
  });
}

// Backend — send push notification via web-push
import webpush from 'web-push';

export async function sendPush(userId: string, payload: { title: string; body: string; url?: string }) {
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  await Promise.allSettled(
    subs.map(s => webpush.sendNotification(
      { endpoint: s.endpoint, keys: s.keys as any },
      JSON.stringify(payload),
    )),
  );
}
```

---

## Offline indicator

```typescript
// frontend/src/hooks/useOnlineStatus.ts
export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

// Global offline banner:
function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] bg-[var(--negative-color)] text-white text-center py-2 text-sm">
      You are offline. Changes will sync when you reconnect.
    </div>
  );
}
```

---

## Workbox update prompt

```typescript
// frontend/src/components/PwaUpdatePrompt.tsx
import { useRegisterSW } from 'virtual:pwa-register/react';

export function PwaUpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] floating-card rounded-[var(--card-radius)] p-4 max-w-sm shadow-[var(--box-shadow-large)]">
      <p className="text-sm font-medium">A new version is available</p>
      <div className="flex gap-2 mt-3">
        <button className="btn btn--primary btn--sm" onClick={() => updateServiceWorker(true)}>Update now</button>
      </div>
    </div>
  );
}
```

---

## Checklist

- [ ] `manifest.json` has `display: "standalone"`, both icon sizes (192 + 512), `start_url: "/"`
- [ ] `theme_color` matches `var(--primary-color)` (#0073ea)
- [ ] Service worker precaches all static assets via `__WB_MANIFEST`
- [ ] API routes use `NetworkFirst` — never `CacheOnly` for API calls
- [ ] `beforeinstallprompt` captured and install button shown when appropriate
- [ ] Offline banner shown when `navigator.onLine` is false
- [ ] Push subscription endpoint saved to DB per user (for server-side send)
- [ ] `notificationclick` handler opens the relevant in-app URL
- [ ] Update prompt shown when new service worker is waiting
- [ ] Lighthouse PWA score ≥ 90
