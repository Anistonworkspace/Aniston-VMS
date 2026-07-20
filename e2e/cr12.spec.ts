import { test, expect } from './fixtures';
import type { APIRequestContext } from '@playwright/test';
import { DEMO_EMAIL, DEMO_PASSWORD } from './helpers';

// ── CR-12 feature specs ──────────────────────────────────────────────────────
// 1. Live wall: layout capacity gate ("Wall is full" on a 1×1 wall)
// 2. Add camera: client-side required-field gate + duplicate-RTSP rejection
// 3. Cameras map view: markers render and navigate to camera detail
// 4. Overview: zone card click navigates to the zone dashboard
// 5. Clips: status filter + zone storage-policy block on new exports
// 6. Settings: snapshot backup create + signed download link

const API = 'http://127.0.0.1:4000/api';

/** Admin bearer token straight from the auth API (UI-independent setup). */
async function apiToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/auth/login`, {
    data: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  expect(res.ok(), `login for API setup failed: ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as {
    data?: { accessToken?: string; tokens?: { accessToken?: string } };
  };
  const token = body.data?.accessToken ?? body.data?.tokens?.accessToken;
  expect(token, 'no accessToken in login response').toBeTruthy();
  return token as string;
}

function authed(token: string): { headers: Record<string, string> } {
  return { headers: { Authorization: `Bearer ${token}` } };
}

/** Unwrap { data } | { data: { items } } list envelopes. */
function items<T>(body: unknown): T[] {
  const data = (body as { data?: unknown }).data;
  if (Array.isArray(data)) return data as T[];
  const inner = (data as { items?: unknown } | undefined)?.items;
  return Array.isArray(inner) ? (inner as T[]) : [];
}

// ── 1. Live wall capacity gate ───────────────────────────────────────────────

test('live wall: 1x1 layout fills after one camera and gates further adds', async ({
  authedPage: page,
}) => {
  // A persisted wall from an earlier session would skew capacity — clear the key
  // *before* the app boots (removeItem+reload races the app's persistence effect,
  // which re-writes the wall after the key is removed).
  await page.addInitScript(() => localStorage.removeItem('vms.livewall.wall'));
  await page.goto('/live');

  // KIND_LABEL.L1x1 = '1×1' (capacity 1) inside the "Wall layout" group.
  await page
    .getByRole('group', { name: 'Wall layout' })
    .getByRole('button', { name: /^1\s*[×x]\s*1$/ })
    .click();

  const adder = page.locator('select[aria-label="Add camera to wall"]');
  // The app auto-seeds an empty wall to capacity once cameras load
  // (LiveWallPage seed effect), so a fresh 1×1 wall arrives already full.
  await expect(adder.locator('option').first()).toHaveText(/Wall is full/, { timeout: 15_000 });
  await expect(adder).toBeDisabled();

  // Clear the wall (auto-fill is once-per-mount, so the empty wall sticks).
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(adder.locator('option').first()).toHaveText(/Add camera/);
  await expect(adder).toBeEnabled();

  // Add one camera → 1×1 capacity reached again: full + gated.
  const value = await adder.locator('option:not([value=""])').first().getAttribute('value');
  expect(value, 'no cameras offered for the wall').toBeTruthy();
  await adder.selectOption(value as string);
  await expect(adder.locator('option').first()).toHaveText(/Wall is full/);
  await expect(adder).toBeDisabled();
});

// ── 2. Add camera: validation gate + duplicate RTSP ──────────────────────────

test('add camera: register stays disabled until required fields, dup RTSP is rejected', async ({
  authedPage: page,
}) => {
  await page.goto('/cameras');
  await page.getByRole('button', { name: 'Add camera' }).click();

  const register = page.getByRole('button', { name: 'Register camera' });
  await expect(register).toBeVisible();
  await expect(register).toBeDisabled();

  // Site + router (first real option of each native select).
  for (const label of ['Site', 'Router'] as const) {
    const sel = page.locator(`select[aria-label="${label}"]`);
    const opt = await sel.locator('option:not([value=""])').first().getAttribute('value');
    expect(opt, `no ${label} options`).toBeTruthy();
    await sel.selectOption(opt as string);
  }

  await page.getByLabel('Camera code *').fill(`CAM-E2E-${Date.now() % 100000}`);
  await page.getByLabel('Name *').fill('E2E duplicate probe');
  // Seeded camera main URL — same normalized host+port+path → mainRtspHash collision.
  await page.getByLabel('Main RTSP URL *').fill('rtsp://10.20.40.11:554/stream1');
  await page.getByLabel('Sub RTSP URL *').fill('rtsp://10.20.40.11:554/stream2');
  await page.getByLabel('RTSP user *').fill('svc_probe');
  await page.getByLabel('RTSP password *').fill('probe-secret-1');
  await page.getByLabel('Codec *').fill('H.264');
  await page.getByLabel('Resolution *').fill('1920x1080');
  await page.getByLabel('FPS *').fill('15');
  await page.getByLabel('Bitrate kbps *').fill('2048');

  // Position pin — click the centre of the picker map.
  await expect(register).toBeDisabled(); // still gated on the pin
  const picker = page.locator('[aria-label="Camera position picker"]');
  await picker.scrollIntoViewIfNeeded();
  const box = await picker.boundingBox();
  expect(box).toBeTruthy();
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(register).toBeEnabled();
  await register.click();

  // Server rejects the duplicate mainRtspHash (unique) → error toast.
  await expect(page.getByText(/Registration failed/i)).toBeVisible({ timeout: 15_000 });
});

// ── 3. Cameras map view: marker → camera detail ──────────────────────────────

test('cameras map: markers render and clicking one opens the camera page', async ({
  authedPage: page,
}) => {
  await page.goto('/cameras');
  await page.locator('main').getByRole('button', { name: /^map$/i }).first().click();

  // Markers can overlap at the default zoom (two cameras at the same site sit
  // near-identical coords); the DOM-last marker paints topmost, so it is the
  // only one guaranteed clickable with real pointer semantics.
  const marker = page.locator('[aria-label^="Open "]').last();
  await expect(marker).toBeVisible({ timeout: 15_000 });
  await marker.click();
  await expect(page).toHaveURL(/\/cameras\/[0-9a-f-]{36}/, { timeout: 10_000 });
});

// ── 3b. Camera detail: inline rename updates the heading ─────────────────────

test('camera detail: inline rename saves and updates the heading', async ({ authedPage: page }) => {
  const token = await apiToken(page.request);
  const camerasRes = await page.request.get(`${API}/cameras?limit=1`, authed(token));
  expect(camerasRes.ok(), `list cameras failed: ${camerasRes.status()}`).toBeTruthy();
  const [camera] = items<{ id: string; name: string }>(await camerasRes.json());
  expect(camera, 'no cameras in fleet to rename').toBeTruthy();

  const original = camera.name;
  const renamed = `${original} (e2e)`.slice(0, 150);

  try {
    // The :cameraId route opens the health drawer directly on load.
    await page.goto(`/cameras/${camera.id}`);
    await expect(page.getByRole('heading', { name: original, level: 2 })).toBeVisible({
      timeout: 15_000,
    });

    // Pencil → edit inline → Enter commits the rename.
    await page.getByRole('button', { name: 'Rename camera' }).click();
    const input = page.getByLabel('Camera name');
    await expect(input).toBeVisible();
    await input.fill(renamed);
    await input.press('Enter');

    // Heading reflects the new name once the mutation invalidates the cache.
    await expect(page.getByRole('heading', { name: renamed, level: 2 })).toBeVisible({
      timeout: 10_000,
    });
  } finally {
    // Restore the fleet name so name-matching specs stay deterministic.
    await page.request.patch(`${API}/cameras/${camera.id}`, {
      ...authed(token),
      data: { name: original },
    });
  }
});

// ── 4. Overview: zone card navigation ────────────────────────────────────────

test('overview: clicking a zone card lands on that zone dashboard', async ({
  authedPage: page,
}) => {
  await page.goto('/');
  const card = page.locator('main a[href^="/zones/"]').first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  const cardText = ((await card.textContent()) ?? '').trim();
  await card.click();
  await expect(page).toHaveURL(/\/zones\/[0-9a-f-]{36}/);
  // The app shell keeps its own "Overview" h1 mounted — target the zone page's h1.
  const h1 = page
    .locator('h1')
    .filter({ hasNotText: /^Overview$/i })
    .first();
  await expect(h1).toBeVisible({ timeout: 15_000 });
  const zoneName = ((await h1.textContent()) ?? '').trim();
  expect(zoneName.length).toBeGreaterThan(0);
  // The card that was clicked should reference the zone it navigated to.
  expect(cardText).toContain(zoneName.slice(0, Math.min(zoneName.length, 12)));
});

// ── 5. Clips: status filter + storage-policy block ───────────────────────────

test('clips: status filter narrows list; storeClips=false zone blocks new exports', async ({
  authedPage: page,
}) => {
  // API setup: map a camera → site → zone, then block clips on that zone.
  const token = await apiToken(page.request);

  const camerasRes = await page.request.get(`${API}/cameras?limit=100`, authed(token));
  expect(camerasRes.ok()).toBeTruthy();
  const cameras = items<{ id: string; name: string; siteId: string }>(await camerasRes.json());
  expect(cameras.length, 'no cameras in fleet').toBeGreaterThan(0);

  const sitesRes = await page.request.get(`${API}/sites?page=1&limit=100`, authed(token));
  expect(sitesRes.ok()).toBeTruthy();
  const sites = items<{ id: string; zoneId?: string }>(await sitesRes.json());
  const camera = cameras.find((c) => sites.some((s) => s.id === c.siteId && s.zoneId));
  expect(camera, 'no camera with a resolvable zone').toBeTruthy();
  const zoneId = sites.find((s) => s.id === (camera as { siteId: string }).siteId)
    ?.zoneId as string;
  const cameraName = (camera as { name: string }).name;

  const upsert = (storeClips: boolean) =>
    page.request.put(`${API}/settings/storage-policies`, {
      ...authed(token),
      data: { scopeType: 'ZONE', scopeId: zoneId, storeClips, storeSnapshots: true },
    });
  const upsertRes = await upsert(false);
  expect(upsertRes.ok(), `policy upsert failed: ${upsertRes.status()}`).toBeTruthy();

  try {
    await page.goto('/clips');

    // Status filter (Radix select): trigger → option "Done".
    await page.locator('main').getByLabel('Status').click();
    await page.getByRole('option', { name: /^done$/i }).click();
    const rows = page.locator('main table tbody tr');
    await page.waitForTimeout(750); // allow the filtered refetch to settle
    if ((await rows.count()) > 0) {
      await expect(rows.first()).toContainText(/done/i);
    } else {
      await expect(page.locator('main')).toContainText(/no clips|queue your first/i);
    }

    // Policy block: queue an export for a camera inside the blocked zone.
    await page.getByRole('button', { name: 'New clip' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Camera').click();
    await page
      .getByRole('option', { name: new RegExp(escapeRegex(cameraName)) })
      .first()
      .click();
    await dialog.getByLabel('Start').fill('2026-07-17T10:00');
    await dialog.getByLabel('End').fill('2026-07-17T10:01');
    await dialog.getByRole('button', { name: 'Queue export' }).click();

    // clip.service: "Clip storage is disabled for this camera's zone by storage policy…"
    await expect(page.getByText(/Clip storage is disabled/i).first()).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await upsert(true); // restore — don't poison the rest of the suite
  }
});

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── 6. Settings: backup create + download ────────────────────────────────────

test('settings: snapshot backup can be created and exposes a working download', async ({
  authedPage: page,
}) => {
  test.setTimeout(90_000); // reload + cold-load + server-side zip under parallel load
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Storage & Backups' }).click();

  // A scope is required — "Create backup" no-ops (toast) with none selected, so a real
  // backup is only built once a zone is chosen. Scope to the backup row via its unique
  // "Create backup" button (the storage-policy card above has a same-labelled Zone
  // select), then pick the first real zone from the 2nd <select> (0=Scope, 1=Zone).
  const createBtn = page.getByRole('button', { name: 'Create backup' });
  const backupRow = createBtn.locator('xpath=ancestor::div[contains(@class,"grid")][1]');
  const zoneSelect = backupRow.locator('select').nth(1);
  await expect(zoneSelect).toBeVisible();
  // Zone options come from an async query — wait until they populate (placeholder + ≥1).
  await expect
    .poll(async () => zoneSelect.locator('option').count(), { timeout: 15_000 })
    .toBeGreaterThan(1);
  const zoneValues = await zoneSelect
    .locator('option')
    .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
  expect(zoneValues.length, 'no zones available to back up').toBeGreaterThan(0);
  await zoneSelect.selectOption(zoneValues[0]);

  // Create a fresh backup and wait for the server to finish building it.
  // createBackup is synchronous server-side (zips + persists + flips to DONE in the
  // request), so a successful POST means the artifact is on disk right now.
  const [resp] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/settings/backups') && r.request().method() === 'POST',
      { timeout: 60_000 }
    ),
    createBtn.click(),
  ]);
  expect(resp.ok(), `create backup POST returned ${resp.status()}`).toBeTruthy();

  // Reload for clean server truth (list is createdAt-desc) so the top row is
  // deterministically the backup we just created — NOT a pre-existing row whose
  // file may predate a container rebuild (the dev stack's uploads are ephemeral).
  await page.reload();
  await page.getByRole('tab', { name: 'Storage & Backups' }).click();
  // Two tables render here (storage policies + backups). Target the backups table
  // specifically by its unique "Status" column header, else the policies row wins.
  const backupsTable = page
    .locator('main table')
    .filter({ has: page.locator('th', { hasText: 'Status' }) });
  const newRow = backupsTable.locator('tbody tr').first();
  await expect(newRow).toBeVisible({ timeout: 15_000 });
  await expect(newRow).toContainText(/done/i, { timeout: 15_000 });

  const link = newRow.locator('a', { hasText: 'Download' }).first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href, 'download link has no href').toBeTruthy();
  const url = /^https?:/i.test(href as string)
    ? (href as string)
    : new URL(href as string, 'http://127.0.0.1:4000').toString();
  const dl = await page.request.get(url);
  expect(dl.ok(), `signed download URL returned ${dl.status()}`).toBeTruthy();
});
