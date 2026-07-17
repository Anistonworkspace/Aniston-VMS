# Skill — Capacitor Mobile Patterns

Android/iOS build pipeline, push notifications (FCM), camera, filesystem, deep links, safe area.

---

## Capacitor setup (already scaffolded in boilerplate)

```bash
# Add Android/iOS platforms
npx cap add android
npx cap add ios

# Sync web build to native projects
npm run build && npx cap sync

# Open in native IDE
npx cap open android   # Android Studio
npx cap open ios       # Xcode
```

---

## capacitor.config.ts

```typescript
// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId:     'com.aniston.boilerplate',
  appName:   'Boilerplate App',
  webDir:    'dist',
  server: {
    // Dev: point to Vite dev server (hot reload in native app)
    // Comment out for production builds
    // url: 'http://192.168.1.100:5173',
    // cleartext: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide:     true,
      backgroundColor:    '#f1ece3',
      androidSplashResourceName: 'splash',
      showSpinner:        false,
    },
    StatusBar: {
      style:           'DEFAULT',
      backgroundColor: '#f1ece3',
    },
  },
};

export default config;
```

---

## Push notifications — FCM setup

```typescript
// frontend/src/lib/capacitorPush.ts
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor }          from '@capacitor/core';

export async function registerPushNotifications(
  onToken: (token: string) => void,
) {
  if (!Capacitor.isNativePlatform()) return;    // skip in browser

  // Request permission
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return;

  // Register with FCM / APNS
  await PushNotifications.register();

  // Get FCM token — send to backend
  PushNotifications.addListener('registration', ({ value: token }) => {
    onToken(token);
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('Push registration error:', err);
  });

  // Handle foreground notification
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    // Show in-app banner when app is in foreground
    toast(notification.title ?? 'Notification', { description: notification.body });
  });

  // Handle tap on notification (background/killed)
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const data = action.notification.data;
    if (data?.route) {
      // Navigate to the relevant screen
      window.location.hash = data.route;
    }
  });
}

// Call this on app boot — after login:
// await registerPushNotifications(token => saveFcmToken(token));
```

---

## Camera — photo capture

```typescript
// frontend/src/lib/capacitorCamera.ts
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export async function capturePhoto(): Promise<File | null> {
  if (!Capacitor.isNativePlatform()) {
    // Web fallback — use input[type=file]
    return null;
  }

  const photo = await Camera.getPhoto({
    quality:      80,
    allowEditing: false,
    resultType:   CameraResultType.DataUrl,
    source:       CameraSource.Prompt,   // asks user: camera or gallery
    width:        800,
    height:       800,
    correctOrientation: true,
  });

  if (!photo.dataUrl) return null;

  // Convert dataURL to File for upload
  const res  = await fetch(photo.dataUrl);
  const blob = await res.blob();
  return new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
}

// Usage in item photo upload:
async function handlePhotoCapture() {
  const file = await capturePhoto();
  if (file) {
    const formData = new FormData();
    formData.append('photo', file);
    await uploadPhoto(formData).unwrap();
  }
}
```

---

## Deep links — Android intent filter

```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<!-- Add inside the <activity> tag -->
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <!-- Your app domain -->
  <data android:scheme="https" android:host="app.yourdomain.com" />
  <!-- Custom scheme for dev/testing -->
  <data android:scheme="boilerplate" android:host="open" />
</intent-filter>
```

```typescript
// Handle deep link in app boot:
import { App } from '@capacitor/app';

App.addListener('appUrlOpen', ({ url }) => {
  const route = new URL(url).pathname;
  // Navigate to the route
  window.history.pushState({}, '', route);
  window.dispatchEvent(new PopStateEvent('popstate'));
});
```

---

## Safe area (notch / home indicator)

```css
/* globals.css — use env() safe area variables */
.app-container {
  padding-top:    env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left:   env(safe-area-inset-left);
  padding-right:  env(safe-area-inset-right);
}

/* For sticky headers: */
.page-header {
  padding-top: max(12px, env(safe-area-inset-top));
}

/* For bottom navigation: */
.bottom-nav {
  padding-bottom: max(8px, env(safe-area-inset-bottom));
}
```

```typescript
// Set the viewport meta in index.html:
// <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

---

## Network status detection (Capacitor)

```typescript
// frontend/src/hooks/useCapacitorNetwork.ts
import { Network } from '@capacitor/network';
import { Capacitor } from '@capacitor/core';
import { useState, useEffect } from 'react';

export function useNetworkStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    Network.getStatus().then(s => setOnline(s.connected));

    const listener = Network.addListener('networkStatusChange', (s) => {
      setOnline(s.connected);
    });

    return () => { listener.then(l => l.remove()); };
  }, []);

  return online;
}
```

---

## Build pipeline (GitHub Actions)

```yaml
# .github/workflows/android-build.yml (excerpt)
- name: Build Android APK
  run: |
    npm run build
    npx cap sync android
    cd android
    ./gradlew assembleRelease \
      -Pandroid.injected.signing.store.file=${{ secrets.KEYSTORE_PATH }} \
      -Pandroid.injected.signing.store.password=${{ secrets.KEYSTORE_PASSWORD }} \
      -Pandroid.injected.signing.key.alias=${{ secrets.KEY_ALIAS }} \
      -Pandroid.injected.signing.key.password=${{ secrets.KEY_PASSWORD }}
```

---

## Checklist

- [ ] `capacitor.config.ts` `appId` matches `applicationId` in `android/app/build.gradle`
- [ ] `npx cap sync` run after every `npm run build` — never skip
- [ ] FCM token saved to backend with `userId` — sent to the right device per user
- [ ] Push notification tap navigates to the correct in-app route via `notification.data.route`
- [ ] Camera result converted to `File` object before uploading (same upload flow as web)
- [ ] Deep link intent filters added for both HTTPS and custom scheme
- [ ] `viewport-fit=cover` set in index.html for notch support
- [ ] `env(safe-area-inset-*)` applied to sticky headers and bottom navigation
- [ ] Keystore password in GitHub Secrets — NEVER in source code or repo
- [ ] APK/AAB not committed to git — CI uploads directly to EC2 or Play Console
