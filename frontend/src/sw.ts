/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

const navigationHandler = new NetworkFirst({
  cacheName: 'pages',
  networkTimeoutSeconds: 3,
});
registerRoute(new NavigationRoute(navigationHandler, {
  denylist: [/^\/api\//],
}));

registerRoute(
  ({ url }) => url.pathname.match(/\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/),
  new StaleWhileRevalidate({
    cacheName: 'images',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 3600 })],
  }),
);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
