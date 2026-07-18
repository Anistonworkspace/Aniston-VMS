# Skill — Capacitor Mobile Patterns (Field Operator App)

`apps/web` (Capacitor 6, already scaffolded via `apps/web/capacitor.config.ts`) wraps the same
React app for Android/iOS: a field-engineer / on-site-operator companion app — push notifications
for incident/escalation alerts while off the control-room floor, on-site network diagnostics
(is *this* site's router/SIM actually reachable from here?), and photo capture for maintenance
evidence (`EvidencePhotoCard`, `MaintenanceTaskCard`). Per `docs/tech-stack-targets.md`, mobile is
retained/deferred capability — not required for Aniston VMS v1 (a control-room web app) — but the
release pipeline (`store-releases/android/`, `store-releases/ios/`) already exists, so keep the
native layer correct whenever it's touched. See `memory/decisions/ADR-0005-capacitor-over-react-native.md`
for why Capacitor (not React Native) was chosen.

```typescript
// apps/web/capacitor.config.ts (already correct — do not regress this)
const config: CapacitorConfig = {
  appId: 'com.aniston.vms',
  appName: 'Aniston VMS',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
};
```

`pnpm --filter @aniston-vms/web build && npx cap sync` (also `pnpm --filter @aniston-vms/web cap:build:android` / `cap:build:ios`) is the only
way native assets get updated — always check `Capacitor.isNativePlatform()` before calling any
`@capacitor/*` plugin, since the same bundle also runs as the plain web SPA and installable PWA.

---

## Push notifications (`apps/web/src/lib/capacitorPush.ts`)

Same incident/escalation events as the PWA push channel and WhatsApp/email — see
`skill-notification-patterns.md`. Native push uses FCM (Android) / APNs (iOS) tokens instead of a
Web Push subscription, everything else about the fan-out is identical.

```typescript
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

export async function registerPushNotifications(onToken: (token: string) => void) {
  if (!Capacitor.isNativePlatform()) return;

  const { receive } = await PushNotifications.requestPermissions();
  if (receive !== 'granted') return;

  await PushNotifications.register();

  PushNotifications.addListener('registration', (token) => onToken(token.value));
  PushNotifications.addListener('registrationError', (error) =>
    console.error('Push registration error', error),
  );
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    // Foreground incident/escalation push — surface via in-app toast, not a native banner
  });
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    // Deep link into the tapped incident: action.notification.data.incidentId
  });
}
```

```typescript
// apps/api (NestJS) persists { userId, organizationId, platform: 'ANDROID' | 'IOS', token } via Prisma
// scoped exactly like the web push subscription table — see skill-pwa-patterns.md
```

## Network status (`apps/web/src/hooks/useCapacitorNetwork.ts`)

An engineer standing next to a site's router needs to know whether *their phone* has signal — a
false "camera offline" read is useless if their own network is the problem.

```typescript
import { useEffect, useState } from 'react';
import { Network } from '@capacitor/network';

export function useCapacitorNetwork() {
  const [isOnline, setOnline] = useState(true);

  useEffect(() => {
    Network.getStatus().then((status) => setOnline(status.connected));
    const listener = Network.addListener('networkStatusChange', (status) =>
      setOnline(status.connected),
    );
    return () => { listener.remove(); };
  }, []);

  return isOnline;
}
```

## Evidence photo capture (`apps/web/src/lib/capacitorCamera.ts`)

Used from `MaintenanceTaskCard` when an engineer closes out an on-site repair — the photo attaches
to the `MaintenanceTask` / `AuditLog` record as proof of work.

```typescript
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export async function capturePhoto() {
  const photo = await Camera.getPhoto({
    quality: 80,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
  });
  return photo.dataUrl;
}

export async function uploadPhoto(taskId: string, dataUrl: string) {
  const blob = await (await fetch(dataUrl)).blob();
  const formData = new FormData();
  formData.append('photo', blob, `${taskId}-${Date.now()}.jpg`);
  return fetch(`/api/maintenance-tasks/${taskId}/photos`, { method: 'POST', body: formData });
}
```

## Deep links (Android `AndroidManifest.xml`)

Tapping an incident/escalation push or a WhatsApp-shared link should open the app straight to that
incident, not just the app's home screen:

```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="app.anistonvms.example" android:pathPrefix="/incidents" />
</intent-filter>
```

(`anistonvms.example` is a placeholder — set the real production app-link host per environment;
do not hardcode a client's actual domain into the skill/pattern doc.)

---

## Android/iOS signing & release

Handled by `store-releases/android/build-android.ps1` and `store-releases/ios/build-ios.sh` plus
`.github/workflows` release jobs (see `skill-ci-cd-patterns.md`). Signing material lives only in
GitHub Secrets, never in the repo:

- Android: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
- iOS: export options / provisioning handled per `store-releases/ios/ExportOptions.plist.template`

---

## Checklist before shipping a Capacitor change

- [ ] `Capacitor.isNativePlatform()` guards every `@capacitor/*` call (web/PWA build still works)
- [ ] `appId`/`appName` remain `com.aniston.vms` / `Aniston VMS` — never regress to a boilerplate id
- [ ] Push token registration persists `platform` so `apps/api` can pick FCM vs APNs vs Web Push
- [ ] Evidence photos upload with a task/organization scope — never anonymous uploads
- [ ] Safe-area insets (`env(safe-area-inset-*)`) respected on notch/gesture-bar devices
- [ ] `npx cap sync` re-run after any native plugin or config change before building