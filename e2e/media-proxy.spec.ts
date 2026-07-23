import type { APIRequestContext, APIResponse } from '@playwright/test';
import { test, expect } from './fixtures';
import { DEMO_EMAIL, DEMO_PASSWORD } from './helpers';

// Regression: Live Wall HLS 302 chain (nginx media proxy boundary).
//
// MediaMTX v1.19+ answers the first HLS request with a one-time cookie-check
// 302. frontend/nginx.conf rewrites that Location back under /media/hls/, but
// nginx then RE-ABSOLUTIZED the rewritten Location as `http://$host/...`.
// `$host` carries no port and the container listens on 80 while being
// published on 5173, so the browser was sent to http://localhost:80 →
// ERR_CONNECTION_REFUSED → "Stream unavailable". Fixed with
// `absolute_redirect off;` (relative redirects inherit the page's real
// scheme/host/port — no hardcoded ports, works unchanged behind HTTPS).
//
// The API base mirrors playwright.config.ts's documented stack layout and is
// env-overridable; nothing here bypasses auth_request / media_auth cookies.
const API_BASE = process.env.PW_API_URL ?? 'http://localhost:4000';
const CAMERA_CODE = 'CAM-009';

type Jar = Map<string, string>;

function cookieHeader(jar: Jar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function collectCookies(res: APIResponse, jar: Jar): void {
  for (const h of res.headersArray()) {
    if (h.name.toLowerCase() !== 'set-cookie') continue;
    const pair = h.value.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

async function startLiveSession(request: APIRequestContext) {
  const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
    data: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  expect(loginRes.ok(), `login failed: ${loginRes.status()}`).toBeTruthy();
  const loginJson = await loginRes.json();
  const token: string | undefined = loginJson?.data?.accessToken ?? loginJson?.accessToken;
  expect(token, 'no access token in login response').toBeTruthy();
  const auth = { Authorization: `Bearer ${token}` };

  const camsRes = await request.get(`${API_BASE}/api/cameras?pageSize=200`, { headers: auth });
  expect(camsRes.ok()).toBeTruthy();
  const cams = (await camsRes.json())?.data?.items ?? [];
  const cam = cams.find((c: { cameraCode?: string }) => c.cameraCode === CAMERA_CODE);
  expect(cam, `${CAMERA_CODE} not found among ${cams.length} cameras`).toBeTruthy();

  const startRes = await request.post(`${API_BASE}/api/streams/start`, {
    headers: auth,
    data: { cameraId: cam.id, kind: 'LIVE_SUB' },
  });
  expect(startRes.status(), await startRes.text()).toBe(201);
  const session = (await startRes.json()).data;

  const jar: Jar = new Map();
  collectCookies(startRes, jar); // media_auth (HttpOnly, path-scoped)
  return { session, jar, auth };
}

test.describe('media proxy redirect chain (nginx boundary)', () => {
  test('HLS index.m3u8 redirect chain never leaves the frontend origin', async ({
    request,
    baseURL,
  }) => {
    const feOrigin = new URL(baseURL!);
    const { session, jar, auth } = await startLiveSession(request);
    try {
      // Backend contract (verified upstream of the proxy): root-relative URL.
      expect(session.hlsUrl).toMatch(/^\/media\/hls\/.+\/index\.m3u8$/);

      // Follow the chain by hand, asserting every hop stays on the frontend
      // origin — host INCLUDING port. This is the exact boundary that broke:
      // Location: http://localhost/media/hls/...?cookieCheck=1  (port 80).
      let url = new URL(session.hlsUrl, feOrigin).toString();
      let final: APIResponse | undefined;
      for (let hop = 1; hop <= 5 && !final; hop++) {
        const res = await request.get(url, {
          maxRedirects: 0,
          headers: { Cookie: cookieHeader(jar) },
        });
        collectCookies(res, jar);
        if (res.status() >= 300 && res.status() < 400) {
          const location = res.headers()['location'];
          expect(location, `hop ${hop}: 3xx without Location`).toBeTruthy();
          if (!location.startsWith('/')) {
            expect(
              new URL(location).host,
              `hop ${hop}: redirect left the frontend origin ${feOrigin.host} — Location: ${location}`,
            ).toBe(feOrigin.host);
          }
          url = new URL(location, url).toString();
        } else {
          final = res;
        }
      }
      expect(final, 'redirect chain did not settle within 5 hops').toBeTruthy();
      expect(final!.status(), `final URL: ${url}`).toBe(200);
      expect(await final!.text()).toMatch(/^#EXTM3U/);
    } finally {
      await request
        .post(`${API_BASE}/api/streams/${session.id}/end`, { headers: auth, data: {} })
        .catch(() => {});
    }
  });

  test(`live wall: ${CAMERA_CODE} plays through the 5173 proxy`, async ({ authedPage: page }) => {
    // HEVC→H.264 on-demand transcode + HLS segmenting can take a while on a
    // cold start; the in-test waits (45s each) need headroom over the default.
    test.setTimeout(120_000);
    // Persisted wall state would skew the add flow (see cr12.spec.ts).
    await page.addInitScript(() => localStorage.removeItem('vms.livewall.wall'));
    await page.goto('/live');

    await page
      .getByRole('group', { name: 'Wall layout' })
      .getByRole('button', { name: /^1\s*[×x]\s*1$/ })
      .click();
    await page.getByRole('button', { name: 'Clear' }).click();

    // The wall's view mode is persisted wall-wide; in "Screenshots" mode no
    // HLS request ever fires. Force live streams (SegmentedControl renders
    // role="radiogroup"/"radio" — see components/ui/SegmentedControl.tsx).
    await page
      .getByRole('radiogroup', { name: 'Camera view mode' })
      .getByRole('radio', { name: 'Camera Stream' })
      .click();

    const adder = page.locator('select[aria-label="Add camera to wall"]');
    await expect(adder).toBeEnabled({ timeout: 15_000 });
    const option = adder.locator('option', { hasText: new RegExp(`${CAMERA_CODE}|Live Test`) });
    const value = await option.first().getAttribute('value');
    expect(value, `${CAMERA_CODE} not offered in the camera adder`).toBeTruthy();

    // The playlist only loads through the same-origin proxy chain; with the
    // port-80 redirect bug this times out (browser leaves the origin and gets
    // ERR_CONNECTION_REFUSED before any 200 can arrive).
    const playlistLoaded = page.waitForResponse(
      (r) => r.url().includes('/media/hls/') && r.url().includes('index.m3u8') && r.ok(),
      { timeout: 45_000 },
    );
    await adder.selectOption(value as string);
    await playlistLoaded;

    // HEVC sources transcode on demand — allow startup latency, then require
    // real decoded frames, not just a mounted <video>.
    await page.waitForFunction(
      () => {
        const v = document.querySelector('video');
        return !!v && v.readyState >= 2 && v.videoWidth > 0;
      },
      undefined,
      { timeout: 45_000 },
    );
    await expect(page.getByText('Stream unavailable')).toHaveCount(0);
  });
});
