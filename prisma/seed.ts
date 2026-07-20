import 'dotenv/config';
import { createHash, randomBytes, createCipheriv } from 'node:crypto';
import {
  PrismaClient,
  Role,
  ScopeType,
  CameraStatus,
  Diagnosis,
  CheckType,
  PlaybackAdapter,
  IncidentStatus,
  Severity,
  Channel,
  NotificationStatus,
  SnapshotKind,
  RecordingTrack,
  StreamKind,
  ClipStatus,
  LayoutKind,
  PermissionType,
  BackupStatus,
  TaskType,
  TaskSource,
  TaskStatus,
} from '@prisma/client';

// ---------------------------------------------------------------------------
// Aniston VMS seed — implements the seed spec from CLAUDE.md / docs/05-backend-schema.md:
//   4 regions, 13 zones (Delhi structure), 2 demo sites, 2 routers,
//   6 simulator cameras (playback_adapter=ONVIF_G), default alert rules matrix
//   (§6.5), default escalation policy, one user per role (incl. the admin user),
//   demo incidents + incident events + notifications, health checks across all
//   check types and statuses.
// Deterministic: fixed UUIDs, fixed timestamps (re-runnable, wipe-and-reseed).
// ---------------------------------------------------------------------------

const prisma = new PrismaClient();

/** Fixed reference instant (doc v1.0 date) so seeded data is deterministic. */
const SEED_TIME = new Date('2026-07-17T06:00:00.000Z');
const minAgo = (m: number): Date => new Date(SEED_TIME.getTime() - m * 60_000);
const hrAgo = (h: number): Date => minAgo(h * 60);

/** Deterministic UUID-shaped id: block = entity family, n = row number. */
const uid = (block: number, n: number): string =>
  `00000000-0000-4000-8000-${String(block).padStart(4, '0')}${String(n).padStart(8, '0')}`;

const B = {
  region: 1,
  zone: 2,
  site: 3,
  router: 4,
  camera: 5,
  user: 6,
  scope: 7,
  policy: 8,
  step: 9,
  rule: 10,
  recipient: 11,
  incident: 12,
  event: 13,
  notification: 14,
  check: 15,
  snapshot: 16,
  refimage: 17,
  sd: 18,
  segment: 19,
  sim: 20,
  quality: 21,
  stream: 22,
  clip: 23,
  layout: 24,
  mwindow: 25,
  mtask: 26,
  permission: 27,
  setting: 28,
  backup: 29,
} as const;

/** Normalized host:port+path hash, mirroring the duplicate-prevention spec. */
const rtspHash = (rtspUrl: string): string => {
  const u = new URL(rtspUrl);
  const normalized = `${u.hostname.toLowerCase()}:${u.port || '554'}${u.pathname}${u.search}`;
  return createHash('sha256').update(normalized).digest('hex');
};

// Real AES-256-GCM encryption, byte-for-byte compatible with
// backend/src/utils/encryption.ts (base64 of iv|authTag|ciphertext) so the API
// can decrypt seeded RTSP/router secrets at runtime. Uses the same ENCRYPTION_KEY
// the backend loads from the repo-root .env.
const ENC_ALGO = 'aes-256-gcm';
const ENC_IV_LEN = 12;
const ENC_KEY = ((): Buffer => {
  const hex = (process.env.ENCRYPTION_KEY ?? '').trim();
  if (hex.length !== 64) {
    throw new Error(
      'seed: ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes) to encrypt demo secrets. ' +
        'Copy .env.example → .env (or set ENCRYPTION_KEY) before running db:seed.'
    );
  }
  return Buffer.from(hex, 'hex');
})();
const encrypt = (plaintext: string): string => {
  const iv = randomBytes(ENC_IV_LEN);
  const cipher = createCipheriv(ENC_ALGO, ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
};

// Real bcrypt hash of the demo password shown on the login page
// (DEMO_PASSWORD = "AdminDemo2026!"). Every seeded user shares it so all roles
// can be signed in locally to exercise RBAC. Cost 12 matches the auth module.
const DEMO_PASSWORD_HASH = '$2a$12$cOmPkspDIwo6pbpj6Rj5ROJ2Y5e9uX4l0x7/8IpnirWnX0Ua/JVd.';

async function wipe(): Promise<void> {
  // Children first (FK-safe order).
  await prisma.notification.deleteMany();
  await prisma.incidentEvent.deleteMany();
  await prisma.clipExport.deleteMany();
  await prisma.maintenanceTask.deleteMany();
  await prisma.maintenanceWindow.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.alertRule.deleteMany();
  await prisma.escalationStep.deleteMany();
  await prisma.escalationPolicy.deleteMany();
  await prisma.zoneAlertRecipient.deleteMany();
  await prisma.healthCheck.deleteMany();
  await prisma.connectionQualityHourly.deleteMany();
  await prisma.snapshot.deleteMany();
  await prisma.sdCardStatus.deleteMany();
  await prisma.recordingSegment.deleteMany();
  await prisma.referenceImage.deleteMany();
  await prisma.simDataUsage.deleteMany();
  await prisma.streamSession.deleteMany();
  await prisma.savedLayout.deleteMany();
  await prisma.camera.deleteMany();
  await prisma.router.deleteMany();
  await prisma.site.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.region.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.userAccessScope.deleteMany();
  await prisma.userPermission.deleteMany();
  await prisma.backup.deleteMany();
  await prisma.systemSetting.deleteMany();
  await prisma.storagePolicy.deleteMany();
  await prisma.user.deleteMany();
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_SEED !== 'true') {
    console.error('Refusing to seed production database. Set ALLOW_PROD_SEED=true to override.');
    process.exit(1);
  }

  await wipe();

  // -------------------------------------------------------------------------
  // 1. Hierarchy — 4 regions, 13 zones (CLAUDE.md "Seed exactly this Delhi structure")
  // -------------------------------------------------------------------------
  const REGIONS = ['North', 'South', 'West', 'East'] as const;
  const regionId: Record<(typeof REGIONS)[number], string> = {
    North: uid(B.region, 1),
    South: uid(B.region, 2),
    West: uid(B.region, 3),
    East: uid(B.region, 4),
  };
  await prisma.region.createMany({
    data: REGIONS.map((name) => ({ id: regionId[name], name, status: 'ACTIVE' })),
  });

  const ZONES: Array<{
    n: number;
    region: (typeof REGIONS)[number];
    name: string;
    lat: number;
    lng: number;
  }> = [
    { n: 1, region: 'North', name: 'Rohini', lat: 28.7361, lng: 77.1109 },
    { n: 2, region: 'North', name: 'Civil Lines', lat: 28.6814, lng: 77.2226 },
    { n: 3, region: 'North', name: 'Keshav Puram', lat: 28.689, lng: 77.162 },
    { n: 4, region: 'North', name: 'Narela', lat: 28.8426, lng: 77.0918 },
    { n: 5, region: 'North', name: 'Karol Bagh (CTSP)', lat: 28.6519, lng: 77.1907 },
    { n: 6, region: 'South', name: 'Central', lat: 28.5623, lng: 77.2373 },
    { n: 7, region: 'South', name: 'Hauz Khas', lat: 28.5494, lng: 77.2001 },
    { n: 8, region: 'West', name: 'Rajouri Garden', lat: 28.6425, lng: 77.1225 },
    { n: 9, region: 'West', name: 'Najafgarh', lat: 28.6092, lng: 76.9854 },
    { n: 10, region: 'East', name: 'Shahdara North 1', lat: 28.6951, lng: 77.2889 },
    { n: 11, region: 'East', name: 'Shahdara North 2', lat: 28.7012, lng: 77.2954 },
    { n: 12, region: 'East', name: 'Shahdara South 1', lat: 28.6723, lng: 77.2867 },
    { n: 13, region: 'East', name: 'Shahdara South 2', lat: 28.6648, lng: 77.2931 },
  ];
  await prisma.zone.createMany({
    data: ZONES.map((z) => ({
      id: uid(B.zone, z.n),
      regionId: regionId[z.region],
      name: z.name,
      latitude: z.lat,
      longitude: z.lng,
      status: 'ACTIVE',
    })),
  });
  const zoneRohini = uid(B.zone, 1);
  const zoneHauzKhas = uid(B.zone, 7);

  // -------------------------------------------------------------------------
  // 2. Two demo sites (one demo client organization) + two routers
  // -------------------------------------------------------------------------
  const DEMO_CLIENT_ID = 'CLIENT-DEMO-001'; // the single demo client organization
  const site1 = uid(B.site, 1);
  const site2 = uid(B.site, 2);
  await prisma.site.createMany({
    data: [
      {
        id: site1,
        zoneId: zoneRohini,
        name: 'Rohini Sector 7 Market',
        address: 'Main Market Road, Sector 7, Rohini, Delhi 110085',
        latitude: 28.7355,
        longitude: 77.1089,
        clientId: DEMO_CLIENT_ID,
        status: 'ACTIVE',
      },
      {
        id: site2,
        zoneId: zoneHauzKhas,
        name: 'Hauz Khas Village Gate',
        address: 'Hauz Khas Village Entry Gate, Delhi 110016',
        latitude: 28.5535,
        longitude: 77.1942,
        clientId: DEMO_CLIENT_ID,
        status: 'ACTIVE',
      },
    ],
  });

  const router1 = uid(B.router, 1);
  const router2 = uid(B.router, 2);
  await prisma.router.createMany({
    data: [
      {
        id: router1,
        siteId: site1,
        serialNumber: 'RUT241-SEED-0001',
        imei: '860000000000001',
        simNumber: '8991000000000000001',
        operator: 'Airtel',
        publicStaticIp: '49.36.10.11',
        managementPort: 8443,
        model: 'Teltonika RUT241',
        firmwareVersion: 'RUT2M_R_00.07.06',
        lastSeenAt: minAgo(1),
        signalStrength: -71,
        connectionStatus: 'ONLINE',
        dataApiAvailable: true,
      },
      {
        id: router2,
        siteId: site2,
        serialNumber: 'RUT241-SEED-0002',
        imei: '860000000000002',
        simNumber: '8991000000000000002',
        operator: 'Jio',
        publicStaticIp: '49.36.10.12',
        managementPort: 8443,
        model: 'Teltonika RUT241',
        firmwareVersion: 'RUT2M_R_00.07.06',
        lastSeenAt: minAgo(3),
        signalStrength: -89,
        connectionStatus: 'ONLINE',
        dataApiAvailable: false,
      },
    ],
  });

  // -------------------------------------------------------------------------
  // 3. Six simulator cameras (ONVIF_G), CAM-001…CAM-006, 3 per site
  // -------------------------------------------------------------------------
  const cameraDefs: Array<{
    n: number;
    siteId: string;
    routerId: string;
    name: string;
    host: string;
    latitude: number;
    longitude: number;
    status: CameraStatus;
    healthScore: number;
    diagnosis: Diagnosis | null;
    maintenanceMode?: boolean;
    playbackVerified?: boolean;
    lastHealthyAt?: Date;
    lastSnapshotAt?: Date;
  }> = [
    {
      n: 1,
      siteId: site1,
      routerId: router1,
      name: 'Rohini Market — Entry Gate',
      host: '10.20.30.11',
      latitude: 28.7361,
      longitude: 77.108,
      status: CameraStatus.HEALTHY,
      healthScore: 98,
      diagnosis: null,
      playbackVerified: true,
      lastHealthyAt: minAgo(2),
      lastSnapshotAt: minAgo(12),
    },
    {
      n: 2,
      siteId: site1,
      routerId: router1,
      name: 'Rohini Market — Parking',
      host: '10.20.30.12',
      latitude: 28.7352,
      longitude: 77.1095,
      status: CameraStatus.HEALTHY,
      healthScore: 93,
      diagnosis: null,
      playbackVerified: true,
      lastHealthyAt: minAgo(4),
      lastSnapshotAt: minAgo(9),
    },
    {
      n: 3,
      siteId: site1,
      routerId: router1,
      name: 'Rohini Market — Rear Lane',
      host: '10.20.30.13',
      latitude: 28.7349,
      longitude: 77.1083,
      status: CameraStatus.WARNING,
      healthScore: 71,
      diagnosis: Diagnosis.SIM_SIGNAL_ISSUE,
      lastHealthyAt: hrAgo(3),
      lastSnapshotAt: minAgo(42),
    },
    {
      n: 4,
      siteId: site2,
      routerId: router2,
      name: 'Hauz Khas Gate — Main View',
      host: '10.20.40.11',
      latitude: 28.5541,
      longitude: 77.1946,
      status: CameraStatus.CRITICAL,
      healthScore: 12,
      diagnosis: Diagnosis.CAMERA_OFFLINE,
      lastHealthyAt: hrAgo(6),
      lastSnapshotAt: hrAgo(6),
    },
    {
      n: 5,
      siteId: site2,
      routerId: router2,
      name: 'Hauz Khas Gate — Footpath',
      host: '10.20.40.12',
      latitude: 28.5531,
      longitude: 77.1937,
      status: CameraStatus.MAINTENANCE,
      healthScore: 55,
      diagnosis: null,
      maintenanceMode: true,
      lastHealthyAt: hrAgo(26),
      lastSnapshotAt: hrAgo(25),
    },
    {
      n: 6,
      siteId: site2,
      routerId: router2,
      name: 'Hauz Khas Gate — Cycle Stand',
      host: '10.20.40.13',
      latitude: 28.5528,
      longitude: 77.1949,
      status: CameraStatus.UNKNOWN,
      healthScore: 0,
      diagnosis: null,
    },
  ];

  for (const c of cameraDefs) {
    const mainUrl = `rtsp://${c.host}:554/stream1`;
    const subUrl = `rtsp://${c.host}:554/stream2`;
    await prisma.camera.create({
      data: {
        id: uid(B.camera, c.n),
        siteId: c.siteId,
        routerId: c.routerId,
        cameraCode: `CAM-${String(c.n).padStart(3, '0')}`,
        name: c.name,
        brand: 'Generic',
        model: 'ONVIF-SIM-1080P',
        firmware: 'sim-1.0.0',
        serialNumber: `SIMCAM-${String(c.n).padStart(4, '0')}`,
        mainRtspUrlEncrypted: encrypt(mainUrl),
        subRtspUrlEncrypted: encrypt(subUrl),
        mainRtspHash: rtspHash(mainUrl),
        subRtspHash: rtspHash(subUrl),
        rtspUsernameEncrypted: encrypt('admin'),
        rtspPasswordEncrypted: encrypt('seed-demo-password'),
        onvifPort: 8000,
        onvifCapabilities: { profiles: ['Profile S', 'Profile G'], ptz: false },
        playbackAdapter: PlaybackAdapter.ONVIF_G,
        playbackVerified: c.playbackVerified ?? false,
        expectedCodec: 'H.264',
        expectedResolution: '1920x1080',
        expectedFps: 15,
        expectedBitrateKbps: 2048,
        status: c.status,
        healthScore: c.healthScore,
        diagnosis: c.diagnosis,
        maintenanceMode: c.maintenanceMode ?? false,
        latitude: c.latitude,
        longitude: c.longitude,
        lastHealthyAt: c.lastHealthyAt ?? null,
        lastSnapshotAt: c.lastSnapshotAt ?? null,
      },
    });
  }
  const cam = (n: number): string => uid(B.camera, n);

  // -------------------------------------------------------------------------
  // 4. One user per role + access scopes
  // -------------------------------------------------------------------------
  const users: Array<{
    n: number;
    email: string;
    name: string;
    phone: string;
    role: Role;
    scopeType: ScopeType;
    scopeId: string | null;
  }> = [
    {
      n: 1,
      email: 'admin@anistonvms.example',
      name: 'Aniston Super Admin',
      phone: '+91-9800000001',
      role: Role.SUPER_ADMIN,
      scopeType: ScopeType.ALL,
      scopeId: null,
    },
    {
      n: 2,
      email: 'pm@anistonvms.example',
      name: 'Priya Malhotra (Project Manager)',
      phone: '+91-9800000002',
      role: Role.PROJECT_ADMIN,
      scopeType: ScopeType.ALL,
      scopeId: null,
    },
    {
      n: 3,
      email: 'operator@anistonvms.example',
      name: 'Omkar Patil (Control Room)',
      phone: '+91-9800000003',
      role: Role.OPERATOR,
      scopeType: ScopeType.ALL,
      scopeId: null,
    },
    {
      n: 4,
      email: 'engineer.rohini@anistonvms.example',
      name: 'Ravi Kumar (Rohini Engineer)',
      phone: '+91-9800000004',
      role: Role.ENGINEER,
      scopeType: ScopeType.ZONE,
      scopeId: zoneRohini,
    },
    {
      n: 5,
      email: 'viewer@client.example',
      name: 'Client Viewer (Demo Client)',
      phone: '+91-9800000005',
      role: Role.CLIENT_VIEWER,
      scopeType: ScopeType.SITE,
      scopeId: site1,
    },
    {
      n: 6,
      email: 'auditor@anistonvms.example',
      name: 'Asha Verma (Auditor)',
      phone: '+91-9800000006',
      role: Role.AUDITOR,
      scopeType: ScopeType.ALL,
      scopeId: null,
    },
    {
      n: 7,
      email: 'camviewer@client.example',
      name: 'Camera Viewer (Single-Camera Demo)',
      phone: '+91-9800000007',
      role: Role.CLIENT_VIEWER,
      scopeType: ScopeType.CAMERA,
      scopeId: cam(1),
    },
  ];
  await prisma.user.createMany({
    data: users.map((u) => ({
      id: uid(B.user, u.n),
      email: u.email,
      passwordHash: DEMO_PASSWORD_HASH,
      name: u.name,
      phone: u.phone,
      role: u.role,
    })),
  });
  await prisma.userAccessScope.createMany({
    data: users.map((u) => ({
      id: uid(B.scope, u.n),
      userId: uid(B.user, u.n),
      scopeType: u.scopeType,
      scopeId: u.scopeId,
    })),
  });
  const userEngineer = uid(B.user, 4);
  const userAdmin = uid(B.user, 1);

  // v1.5: demo LIVE_VIEW grants — admin and one operator have it; the zone
  // engineer deliberately does not (exercises the permission gate end-to-end).
  await prisma.userPermission.createMany({
    data: [
      {
        id: uid(B.permission, 1),
        userId: userAdmin,
        permission: PermissionType.LIVE_VIEW,
        grantedBy: userAdmin,
        grantedAt: hrAgo(72),
      },
      {
        id: uid(B.permission, 2),
        userId: uid(B.user, 3),
        permission: PermissionType.LIVE_VIEW,
        grantedBy: userAdmin,
        grantedAt: hrAgo(48),
      },
    ],
  });

  // v1.5: default system settings (docs/05 §Retention & jobs documented keys).
  await prisma.systemSetting.createMany({
    data: [
      { id: uid(B.setting, 1), key: 'retention_days', value: 30 },
      { id: uid(B.setting, 2), key: 'compression_quality', value: 70 },
      { id: uid(B.setting, 3), key: 'max_live_sessions_global', value: 40 },
      { id: uid(B.setting, 4), key: 'max_live_sessions_per_site', value: 6 },
    ],
  });

  // v1.5: one completed demo backup row.
  await prisma.backup.create({
    data: {
      id: uid(B.backup, 1),
      requestedBy: userAdmin,
      scopeType: ScopeType.ZONE,
      scopeId: zoneRohini,
      rangeStart: hrAgo(24 * 8),
      rangeEnd: hrAgo(24),
      status: BackupStatus.DONE,
      fileKey: 'backups/demo/zone-rohini-weekly.zip',
      sizeBytes: BigInt(734_003_200),
    },
  });

  // -------------------------------------------------------------------------
  // 5. Default escalation policy (CLAUDE.md §6.5 recipient ladder)
  // -------------------------------------------------------------------------
  const defaultPolicy = uid(B.policy, 1);
  await prisma.escalationPolicy.create({
    data: { id: defaultPolicy, name: 'Default escalation policy', zoneId: null },
  });
  const steps: Array<{ after: number; level: string; channels: Channel[] }> = [
    { after: 0, level: 'zone_engineer', channels: [Channel.EMAIL, Channel.WHATSAPP] },
    { after: 0, level: 'project_manager', channels: [Channel.EMAIL] },
    { after: 30, level: 'ops_head', channels: [Channel.EMAIL] },
    { after: 60, level: 'senior_management', channels: [Channel.EMAIL, Channel.WHATSAPP] },
    { after: 60, level: 'client_authority', channels: [Channel.EMAIL] },
  ];
  await prisma.escalationStep.createMany({
    data: steps.map((s, i) => ({
      id: uid(B.step, i + 1),
      policyId: defaultPolicy,
      afterMinutes: s.after,
      recipientLevel: s.level,
      channels: s.channels,
    })),
  });

  // Zone-based alert routing demo rows (Rohini).
  await prisma.zoneAlertRecipient.createMany({
    data: [
      {
        id: uid(B.recipient, 1),
        zoneId: zoneRohini,
        severity: Severity.WARNING,
        channel: Channel.EMAIL,
        recipient: 'engineer.rohini@anistonvms.example',
        escalationLevel: 1,
      },
      {
        id: uid(B.recipient, 2),
        zoneId: zoneRohini,
        severity: Severity.CRITICAL,
        channel: Channel.EMAIL,
        recipient: 'pm@anistonvms.example',
        escalationLevel: 1,
      },
      {
        id: uid(B.recipient, 3),
        zoneId: zoneRohini,
        severity: Severity.CRITICAL,
        channel: Channel.WHATSAPP,
        recipient: '+91-9800000002',
        escalationLevel: 1,
      },
    ],
  });

  // -------------------------------------------------------------------------
  // 6. Default alert rule matrix (CLAUDE.md §6.5) — combined rows split out;
  //    "Recovered → Resolved" mapped to INFO (Severity has no RESOLVED).
  // -------------------------------------------------------------------------
  const rules: Array<{
    name: string;
    condition: Record<string, string | number | boolean>;
    severity: Severity;
    failures: number;
    cooldown: number;
  }> = [
    {
      name: '1 RTSP timeout — retry only',
      condition: { trigger: 'RTSP_TIMEOUT', action: 'RETRY_ONLY' },
      severity: Severity.INFO,
      failures: 1,
      cooldown: 0,
    },
    {
      name: '2 consecutive failures — dashboard warning',
      condition: { trigger: 'CHECK_FAILURE' },
      severity: Severity.WARNING,
      failures: 2,
      cooldown: 10,
    },
    {
      name: '3 consecutive failures or 5 min offline — incident + notify',
      condition: { trigger: 'CHECK_FAILURE', offlineMinutes: 5, createIncident: true },
      severity: Severity.CRITICAL,
      failures: 3,
      cooldown: 15,
    },
    {
      name: 'Router offline — retry then immediate',
      condition: { trigger: 'ROUTER_OFFLINE', action: 'RETRY_THEN_IMMEDIATE' },
      severity: Severity.CRITICAL,
      failures: 1,
      cooldown: 10,
    },
    {
      name: 'Router up, camera down — camera fault',
      condition: { trigger: 'ROUTER_UP_CAMERA_DOWN' },
      severity: Severity.CRITICAL,
      failures: 1,
      cooldown: 10,
    },
    {
      name: 'Invalid RTSP password — immediate config incident',
      condition: { trigger: 'RTSP_AUTH_FAILED', createIncident: true },
      severity: Severity.CRITICAL,
      failures: 1,
      cooldown: 60,
    },
    {
      name: 'Low FPS ×3 checks — performance',
      condition: { trigger: 'LOW_FPS' },
      severity: Severity.WARNING,
      failures: 3,
      cooldown: 30,
    },
    {
      name: 'Black image ×2 — image failure',
      condition: { trigger: 'BLACK_IMAGE' },
      severity: Severity.CRITICAL,
      failures: 2,
      cooldown: 30,
    },
    {
      name: 'Blur ×2 hourly — maintenance',
      condition: { trigger: 'BLUR', windowMinutes: 60 },
      severity: Severity.WARNING,
      failures: 2,
      cooldown: 60,
    },
    {
      name: 'View shifted — tamper',
      condition: { trigger: 'SCENE_SHIFT' },
      severity: Severity.CRITICAL,
      failures: 1,
      cooldown: 60,
    },
    {
      name: 'Weak signal 15 min — connectivity',
      condition: { trigger: 'WEAK_SIGNAL', windowMinutes: 15 },
      severity: Severity.WARNING,
      failures: 1,
      cooldown: 15,
    },
    {
      name: 'Snapshot overdue 30 min — monitoring failure',
      condition: { trigger: 'SNAPSHOT_OVERDUE', overdueMinutes: 30 },
      severity: Severity.WARNING,
      failures: 1,
      cooldown: 30,
    },
    {
      name: 'No snapshot for 2 h — monitoring failure',
      condition: { trigger: 'SNAPSHOT_OVERDUE', overdueMinutes: 120 },
      severity: Severity.CRITICAL,
      failures: 1,
      cooldown: 60,
    },
    {
      name: 'SD card missing/stopped — SD incident',
      condition: { trigger: 'SD_MISSING_OR_STOPPED' },
      severity: Severity.CRITICAL,
      failures: 1,
      cooldown: 120,
    },
    {
      name: 'SD card full — SD incident',
      condition: { trigger: 'SD_FULL' },
      severity: Severity.WARNING,
      failures: 1,
      cooldown: 120,
    },
    {
      name: 'Recovered — recovery notice',
      condition: { trigger: 'RECOVERY' },
      severity: Severity.INFO,
      failures: 1,
      cooldown: 0,
    },
  ];
  await prisma.alertRule.createMany({
    data: rules.map((r, i) => ({
      id: uid(B.rule, i + 1),
      name: r.name,
      condition: r.condition,
      severity: r.severity,
      consecutiveFailures: r.failures,
      cooldownMinutes: r.cooldown,
      escalationPolicyId: defaultPolicy,
      enabled: true,
    })),
  });

  // -------------------------------------------------------------------------
  // 7. Demo incidents (ANI-CAM-2026-000001…000005) covering the lifecycle
  // -------------------------------------------------------------------------
  const incidentNumber = (n: number): string => `ANI-CAM-2026-${String(n).padStart(6, '0')}`;
  const inc = (n: number): string => uid(B.incident, n);

  await prisma.incident.create({
    data: {
      id: inc(1),
      incidentNumber: incidentNumber(1),
      cameraId: cam(4),
      siteId: site2,
      zoneId: zoneHauzKhas,
      type: 'CAMERA_OFFLINE',
      severity: Severity.CRITICAL,
      status: IncidentStatus.INVESTIGATING,
      diagnosis: Diagnosis.CAMERA_OFFLINE,
      firstDetectedAt: hrAgo(6),
      lastDetectedAt: minAgo(5),
      acknowledgedAt: minAgo(340),
      acknowledgedBy: userEngineer,
      assignedToId: userEngineer,
      slaImpact: true,
    },
  });
  await prisma.incident.create({
    data: {
      id: inc(2),
      incidentNumber: incidentNumber(2),
      cameraId: cam(3),
      siteId: site1,
      zoneId: zoneRohini,
      type: 'SIM_SIGNAL_ISSUE',
      severity: Severity.WARNING,
      status: IncidentStatus.ACKNOWLEDGED,
      diagnosis: Diagnosis.SIM_SIGNAL_ISSUE,
      firstDetectedAt: hrAgo(3),
      lastDetectedAt: minAgo(20),
      acknowledgedAt: minAgo(150),
      acknowledgedBy: userEngineer,
    },
  });
  await prisma.incident.create({
    data: {
      id: inc(3),
      incidentNumber: incidentNumber(3),
      cameraId: cam(2),
      siteId: site1,
      zoneId: zoneRohini,
      type: 'STREAM_DEGRADED',
      severity: Severity.WARNING,
      status: IncidentStatus.DETECTED,
      diagnosis: Diagnosis.STREAM_DEGRADED,
      firstDetectedAt: minAgo(25),
      lastDetectedAt: minAgo(10),
    },
  });
  await prisma.incident.create({
    data: {
      id: inc(4),
      incidentNumber: incidentNumber(4),
      cameraId: cam(1),
      siteId: site1,
      zoneId: zoneRohini,
      type: 'CONFIG_ERROR',
      severity: Severity.CRITICAL,
      status: IncidentStatus.RESOLVED,
      diagnosis: Diagnosis.CONFIG_ERROR,
      firstDetectedAt: hrAgo(30),
      lastDetectedAt: hrAgo(29),
      acknowledgedAt: hrAgo(29),
      acknowledgedBy: userEngineer,
      assignedToId: userEngineer,
      resolvedAt: hrAgo(28),
      rootCause: 'RTSP password rotated on camera but not updated in VMS',
      resolutionNotes: 'Credentials corrected via camera edit form; test connection passed.',
      correctiveAction: 'Credential-change checklist circulated to field team',
      downtimeSeconds: 5400,
    },
  });
  await prisma.incident.create({
    data: {
      id: inc(5),
      incidentNumber: incidentNumber(5),
      cameraId: null, // site-level incident
      siteId: site2,
      zoneId: zoneHauzKhas,
      type: 'SITE_INTERNET_DOWN',
      severity: Severity.CRITICAL,
      status: IncidentStatus.CLOSED,
      diagnosis: Diagnosis.SITE_INTERNET_DOWN,
      firstDetectedAt: hrAgo(50),
      lastDetectedAt: hrAgo(48),
      acknowledgedAt: hrAgo(49),
      acknowledgedBy: userEngineer,
      assignedToId: userEngineer,
      resolvedAt: hrAgo(48),
      recoveryVerifiedAt: hrAgo(47),
      closedAt: hrAgo(46),
      rootCause: 'ISP outage at site uplink',
      resolutionNotes: 'Connectivity restored by ISP; all cameras recovered.',
      downtimeSeconds: 7620,
      slaImpact: true,
    },
  });

  const events: Array<{ incident: string; at: Date; actor: string | null; event: string }> = [
    { incident: inc(1), at: hrAgo(6), actor: null, event: 'DETECTED' },
    { incident: inc(1), at: minAgo(355), actor: null, event: 'CONFIRMED' },
    { incident: inc(1), at: minAgo(354), actor: null, event: 'ALERTED' },
    { incident: inc(1), at: minAgo(340), actor: userEngineer, event: 'ACKNOWLEDGED' },
    { incident: inc(1), at: minAgo(335), actor: userEngineer, event: 'ASSIGNED' },
    { incident: inc(4), at: hrAgo(30), actor: null, event: 'DETECTED' },
    { incident: inc(4), at: hrAgo(30), actor: null, event: 'ALERTED' },
    { incident: inc(4), at: hrAgo(28), actor: userEngineer, event: 'RESOLVED' },
    { incident: inc(5), at: hrAgo(50), actor: null, event: 'DETECTED' },
    { incident: inc(5), at: hrAgo(48), actor: userEngineer, event: 'RESOLVED' },
    { incident: inc(5), at: hrAgo(47), actor: null, event: 'RECOVERY_VERIFIED' },
    { incident: inc(5), at: hrAgo(46), actor: userEngineer, event: 'CLOSED' },
  ];
  await prisma.incidentEvent.createMany({
    data: events.map((e, i) => ({
      id: uid(B.event, i + 1),
      incidentId: e.incident,
      actor: e.actor,
      event: e.event,
      createdAt: e.at,
    })),
  });

  await prisma.notification.createMany({
    data: [
      {
        id: uid(B.notification, 1),
        incidentId: inc(1),
        channel: Channel.EMAIL,
        recipient: 'engineer.rohini@anistonvms.example',
        templateName: 'incident_critical',
        status: NotificationStatus.SENT,
        attemptCount: 1,
        sentAt: minAgo(354),
      },
      {
        id: uid(B.notification, 2),
        incidentId: inc(1),
        channel: Channel.WHATSAPP,
        recipient: '+91-9800000002',
        templateName: 'incident_critical_wa',
        providerMessageId: 'wamid.SEED0001',
        status: NotificationStatus.DELIVERED,
        attemptCount: 1,
        sentAt: minAgo(354),
        deliveredAt: minAgo(353),
      },
      {
        id: uid(B.notification, 3),
        incidentId: inc(4),
        channel: Channel.EMAIL,
        recipient: 'ops.head@anistonvms.example',
        templateName: 'incident_critical',
        status: NotificationStatus.FAILED,
        attemptCount: 3,
        failedAt: hrAgo(29),
        failureReason: 'SMTP connection refused (seed demo)',
      },
      {
        id: uid(B.notification, 4),
        incidentId: inc(5),
        channel: Channel.EMAIL,
        recipient: 'viewer@client.example',
        templateName: 'incident_site_wide',
        status: NotificationStatus.READ,
        attemptCount: 1,
        sentAt: hrAgo(50),
        deliveredAt: hrAgo(50),
        readAt: hrAgo(49),
      },
    ],
  });

  // -------------------------------------------------------------------------
  // 8. Health checks — all 7 check types, success + failure outcomes
  // -------------------------------------------------------------------------
  const checks: Array<{
    camera: string;
    type: CheckType;
    at: Date;
    ok: boolean;
    ms?: number;
    errorCode?: string;
    errorMessage?: string;
    codec?: string;
    resolution?: string;
    fps?: number;
    bitrateKbps?: number;
    framesReceived?: number;
    signalDbm?: number;
    healthScore?: number;
  }> = [
    { camera: cam(1), type: CheckType.ROUTER_TCP, at: minAgo(2), ok: true, ms: 12 },
    { camera: cam(1), type: CheckType.IMAGE_ANALYSIS, at: minAgo(12), ok: true, healthScore: 96 },
    {
      camera: cam(1),
      type: CheckType.RTSP_AUTH,
      at: hrAgo(30),
      ok: false,
      errorCode: 'INVALID_CREDENTIALS',
      errorMessage: '401 Unauthorized on DESCRIBE',
    },
    { camera: cam(2), type: CheckType.SNAPSHOT, at: minAgo(9), ok: true, ms: 830 },
    {
      camera: cam(2),
      type: CheckType.VIDEO_VALIDATION,
      at: minAgo(8),
      ok: true,
      ms: 2100,
      codec: 'H.264',
      resolution: '1920x1080',
      fps: 15,
      bitrateKbps: 1985,
      framesReceived: 450,
      healthScore: 93,
    },
    { camera: cam(2), type: CheckType.RTSP_AUTH, at: minAgo(8), ok: true, ms: 240 },
    {
      camera: cam(3),
      type: CheckType.ROUTER_TCP,
      at: minAgo(6),
      ok: true,
      ms: 940,
      signalDbm: -97,
    },
    {
      camera: cam(3),
      type: CheckType.VIDEO_VALIDATION,
      at: minAgo(5),
      ok: true,
      ms: 5200,
      codec: 'H.264',
      resolution: '1920x1080',
      fps: 8,
      bitrateKbps: 610,
      framesReceived: 240,
      signalDbm: -97,
      healthScore: 71,
    },
    { camera: cam(4), type: CheckType.ROUTER_TCP, at: minAgo(5), ok: true, ms: 35 },
    {
      camera: cam(4),
      type: CheckType.RTSP_PORT,
      at: minAgo(5),
      ok: false,
      errorCode: 'CAMERA_PORT_CLOSED',
      errorMessage: 'TCP connect to 554 refused (router reachable)',
    },
    { camera: cam(5), type: CheckType.SD_HEALTH, at: hrAgo(25), ok: true, ms: 400 },
    {
      camera: cam(6),
      type: CheckType.RTSP_PORT,
      at: minAgo(15),
      ok: false,
      errorCode: 'CONNECTION_TIMEOUT',
      errorMessage: 'No route to camera host',
    },
  ];
  await prisma.healthCheck.createMany({
    data: checks.map((h, i) => ({
      id: uid(B.check, i + 1),
      cameraId: h.camera,
      checkType: h.type,
      startedAt: h.at,
      completedAt: new Date(h.at.getTime() + (h.ms ?? 1000)),
      success: h.ok,
      responseTimeMs: h.ms ?? null,
      errorCode: h.errorCode ?? null,
      errorMessage: h.errorMessage ?? null,
      codec: h.codec ?? null,
      resolution: h.resolution ?? null,
      fps: h.fps ?? null,
      bitrateKbps: h.bitrateKbps ?? null,
      framesReceived: h.framesReceived ?? null,
      signalDbm: h.signalDbm ?? null,
      healthScore: h.healthScore ?? null,
    })),
  });

  // ── 9. Demo media & operations data ─────────────────────────────────────
  // Storage keys below must match scripts/import-demo-media.mjs (npm run
  // demo:media), which downloads open-source media into UPLOAD_DIR so every
  // signed URL below resolves to a real local file.
  const camCode = (n: number): string => `CAM-${String(n).padStart(3, '0')}`;

  // 9a. Snapshots (SUB captures + EVIDENCE for incident 1 on CAM-004).
  const snaps = [
    { n: 1, camN: 1, kind: SnapshotKind.SUB, at: minAgo(12), quality: 0.96 },
    { n: 2, camN: 1, kind: SnapshotKind.SUB, at: hrAgo(6), quality: 0.94 },
    { n: 3, camN: 2, kind: SnapshotKind.SUB, at: minAgo(9), quality: 0.95 },
    { n: 4, camN: 3, kind: SnapshotKind.SUB, at: minAgo(20), quality: 0.74 },
    { n: 5, camN: 4, kind: SnapshotKind.SUB, at: hrAgo(7), quality: 0.92 },
    { n: 6, camN: 4, kind: SnapshotKind.EVIDENCE, at: minAgo(354), quality: 0.31 },
    { n: 7, camN: 5, kind: SnapshotKind.SUB, at: hrAgo(25), quality: 0.62 },
    { n: 8, camN: 5, kind: SnapshotKind.SUB, at: hrAgo(1), quality: 0.9 },
  ];
  await prisma.snapshot.createMany({
    data: snaps.map((s) => ({
      id: uid(B.snapshot, s.n),
      cameraId: cam(s.camN),
      capturedAt: s.at,
      kind: s.kind,
      originalKey: `snapshots/${camCode(s.camN)}/seed-${s.n}.jpg`,
      thumbnailKey: `snapshots/${camCode(s.camN)}/seed-${s.n}-thumb.jpg`,
      brightnessScore: s.quality,
      blurScore: Math.min(1, s.quality + 0.03),
      freezeScore: 0.99,
      obstructionScore: Math.min(1, s.quality + 0.05),
      sceneShiftScore: s.kind === SnapshotKind.EVIDENCE ? 0.4 : 0.97,
      dustScore: s.quality < 0.7 ? 0.55 : 0.93,
      noiseScore: s.quality < 0.8 ? 0.6 : 0.9,
      colorCastScore: 0.95,
      analysisResult: {
        verdict: s.quality >= 0.7 ? 'ok' : 'degraded',
        flags: s.quality < 0.7 ? ['low_quality'] : [],
      },
      analysisVersion: 'seed-v1',
      createdAt: s.at,
    })),
  });
  await prisma.incident.update({
    where: { id: inc(1) },
    data: {
      previousSnapshotId: uid(B.snapshot, 5),
      faultSnapshotId: uid(B.snapshot, 6),
    },
  });

  // 9b. Approved reference images (one per camera, approved by the admin).
  await prisma.referenceImage.createMany({
    data: [1, 2, 3, 4, 5, 6].map((n) => ({
      id: uid(B.refimage, n),
      cameraId: cam(n),
      s3Key: `reference-images/${camCode(n)}/seed-ref.jpg`,
      approvedById: uid(B.user, 1),
      approvedAt: hrAgo(72),
    })),
  });

  // 9c. SD card status for every camera (§ SD_HEALTH surfaces).
  const sdRows = [
    { n: 1, present: true, cap: 128, free: 41.2, rec: true, seg: minAgo(3) },
    { n: 2, present: true, cap: 128, free: 63.5, rec: true, seg: minAgo(6) },
    { n: 3, present: true, cap: 64, free: 2.1, rec: true, seg: minAgo(8) },
    { n: 4, present: true, cap: 128, free: 77.9, rec: false, seg: hrAgo(7) },
    { n: 5, present: true, cap: 256, free: 120.4, rec: true, seg: hrAgo(25) },
    { n: 6, present: false, cap: null, free: null, rec: null, seg: null },
  ];
  await prisma.sdCardStatus.createMany({
    data: sdRows.map((r) => ({
      id: uid(B.sd, r.n),
      cameraId: cam(r.n),
      present: r.present,
      capacityGb: r.cap,
      freeGb: r.free,
      recordingEnabled: r.rec,
      lastSegmentAt: r.seg,
      checkedAt: r.n === 5 ? hrAgo(25) : minAgo(10),
    })),
  });

  // 9d. Discovered SD recording segments (playback timeline data).
  const segRows = [
    { n: 1, camN: 1, track: RecordingTrack.MAIN, start: hrAgo(3), end: hrAgo(2) },
    { n: 2, camN: 1, track: RecordingTrack.MAIN, start: hrAgo(2), end: hrAgo(1) },
    { n: 3, camN: 1, track: RecordingTrack.SUB, start: hrAgo(2), end: hrAgo(1) },
    { n: 4, camN: 1, track: RecordingTrack.MAIN, start: hrAgo(1), end: minAgo(3) },
    { n: 5, camN: 2, track: RecordingTrack.MAIN, start: hrAgo(3), end: hrAgo(2) },
    { n: 6, camN: 5, track: RecordingTrack.MAIN, start: hrAgo(27), end: hrAgo(26) },
  ];
  await prisma.recordingSegment.createMany({
    data: segRows.map((r) => ({
      id: uid(B.segment, r.n),
      cameraId: cam(r.camN),
      source: 'sd_card',
      track: r.track,
      startAt: r.start,
      endAt: r.end,
      discoveredAt: minAgo(2),
    })),
  });

  // 9e. SIM data usage per router (current + previous billing period).
  const GB = (g: number): bigint => BigInt(Math.round(g * 1024 ** 3));
  await prisma.simDataUsage.createMany({
    data: [
      {
        id: uid(B.sim, 1),
        routerId: uid(B.router, 1),
        period: new Date('2026-07-01'),
        bytesUsed: GB(18.4),
        budgetBytes: GB(50),
      },
      {
        id: uid(B.sim, 2),
        routerId: uid(B.router, 1),
        period: new Date('2026-06-01'),
        bytesUsed: GB(43.1),
        budgetBytes: GB(50),
      },
      {
        id: uid(B.sim, 3),
        routerId: uid(B.router, 2),
        period: new Date('2026-07-01'),
        bytesUsed: GB(9.7),
        budgetBytes: GB(50),
      },
      {
        id: uid(B.sim, 4),
        routerId: uid(B.router, 2),
        period: new Date('2026-06-01'),
        bytesUsed: GB(27.6),
        budgetBytes: GB(50),
      },
    ],
  });

  // 9f. Connection quality hourly (last 12h for cameras 1–3; deterministic).
  const topOfHour = new Date(SEED_TIME);
  topOfHour.setUTCMinutes(0, 0, 0);
  const qualityRows: Array<{
    id: string;
    cameraId: string;
    hour: Date;
    successRate: number;
    medianLatencyMs: number;
    jitterMs: number;
    minSignalDbm: number;
  }> = [];
  let qn = 0;
  for (const camN of [1, 2, 3]) {
    for (let h = 0; h < 12; h += 1) {
      qn += 1;
      const dip = camN === 3 ? 0.12 + 0.03 * (h % 3) : 0.01 * (h % 2);
      qualityRows.push({
        id: uid(B.quality, qn),
        cameraId: cam(camN),
        hour: new Date(topOfHour.getTime() - h * 3_600_000),
        successRate: Math.round((1 - dip) * 100) / 100,
        medianLatencyMs: 40 + camN * 15 + (h % 4) * 5,
        jitterMs: 4 + (h % 3) * 3,
        minSignalDbm: camN === 3 ? -97 - (h % 3) : -71 - (h % 2),
      });
    }
  }
  await prisma.connectionQualityHourly.createMany({ data: qualityRows });

  // 9g. Stream sessions (one live, two ended).
  await prisma.streamSession.createMany({
    data: [
      {
        id: uid(B.stream, 1),
        cameraId: cam(1),
        userId: uid(B.user, 3),
        kind: StreamKind.LIVE_SUB,
        mediamtxPath: 'cam-001-sub',
        startedAt: minAgo(14),
        lastHeartbeatAt: minAgo(1),
        clientIp: '10.30.0.25',
        bytesEstimate: BigInt(52_428_800),
      },
      {
        id: uid(B.stream, 2),
        cameraId: cam(2),
        userId: uid(B.user, 5),
        kind: StreamKind.LIVE_SUB,
        mediamtxPath: 'cam-002-sub',
        startedAt: hrAgo(3),
        lastHeartbeatAt: hrAgo(2),
        endedAt: hrAgo(2),
        endReason: 'ttl_expired',
        clientIp: '10.30.0.31',
        bytesEstimate: BigInt(120_586_240),
      },
      {
        id: uid(B.stream, 3),
        cameraId: cam(1),
        userId: uid(B.user, 3),
        kind: StreamKind.PLAYBACK,
        mediamtxPath: 'playback-cam-001',
        startedAt: hrAgo(5),
        lastHeartbeatAt: hrAgo(5),
        endedAt: new Date(hrAgo(5).getTime() + 10 * 60_000),
        endReason: 'user_stopped',
        clientIp: '10.30.0.25',
        bytesEstimate: BigInt(31_457_280),
      },
    ],
  });

  // 9h. Clip exports: DONE (file provided by demo:media), PROCESSING, FAILED.
  await prisma.clipExport.createMany({
    data: [
      {
        id: uid(B.clip, 1),
        cameraId: cam(1),
        requestedById: uid(B.user, 3),
        startAt: hrAgo(5),
        endAt: new Date(hrAgo(5).getTime() + 2 * 60_000),
        status: ClipStatus.DONE,
        s3Key: 'clips/seed-clip-0001.mp4',
        sizeBytes: BigInt(1_048_576),
      },
      {
        id: uid(B.clip, 2),
        cameraId: cam(2),
        requestedById: uid(B.user, 2),
        startAt: hrAgo(1),
        endAt: new Date(hrAgo(1).getTime() + 5 * 60_000),
        status: ClipStatus.PROCESSING,
      },
      {
        id: uid(B.clip, 3),
        cameraId: cam(4),
        requestedById: uid(B.user, 4),
        startAt: hrAgo(8),
        endAt: new Date(hrAgo(8).getTime() + 2 * 60_000),
        status: ClipStatus.FAILED,
        error: 'Camera offline during export window',
        incidentId: inc(1),
      },
    ],
  });

  // 9i. Saved live-wall layouts.
  await prisma.savedLayout.createMany({
    data: [
      {
        id: uid(B.layout, 1),
        userId: uid(B.user, 3),
        name: 'Control room 2x2',
        layout: LayoutKind.L2x2,
        cameraIds: [cam(1), cam(2), cam(3), cam(4)],
      },
      {
        id: uid(B.layout, 2),
        userId: uid(B.user, 5),
        name: 'Gate focus',
        layout: LayoutKind.L1x1,
        cameraIds: [cam(1)],
      },
    ],
  });

  // 9j. Maintenance windows (active for CAM-005, plus one past site window).
  await prisma.maintenanceWindow.createMany({
    data: [
      {
        id: uid(B.mwindow, 1),
        cameraId: cam(5),
        startAt: hrAgo(26),
        endAt: minAgo(-22 * 60),
        reason: 'Lens cleaning + housing repair',
        approvedById: uid(B.user, 2),
      },
      {
        id: uid(B.mwindow, 2),
        siteId: site1,
        startAt: hrAgo(200),
        endAt: hrAgo(196),
        reason: 'Planned power maintenance',
        approvedById: uid(B.user, 1),
      },
    ],
  });

  // 9k. Maintenance tasks (DONE with before/after snapshots, OPEN, IN_PROGRESS).
  await prisma.maintenanceTask.createMany({
    data: [
      {
        id: uid(B.mtask, 1),
        cameraId: cam(5),
        type: TaskType.LENS_CLEANING,
        source: TaskSource.AUTO,
        status: TaskStatus.DONE,
        assignedToId: uid(B.user, 4),
        beforeSnapshotId: uid(B.snapshot, 7),
        afterSnapshotId: uid(B.snapshot, 8),
        notes: 'Dust score recovered after cleaning; verified against reference image.',
        completedAt: hrAgo(1),
      },
      {
        id: uid(B.mtask, 2),
        cameraId: cam(4),
        type: TaskType.REPAIR,
        source: TaskSource.MANUAL,
        status: TaskStatus.OPEN,
        assignedToId: uid(B.user, 4),
        notes: 'RTSP port closed while router reachable — check camera PSU and cabling.',
      },
      {
        id: uid(B.mtask, 3),
        cameraId: cam(2),
        type: TaskType.INSPECTION,
        source: TaskSource.AUTO,
        status: TaskStatus.IN_PROGRESS,
        assignedToId: uid(B.user, 4),
        notes: 'Scheduled quarterly inspection.',
      },
    ],
  });

  console.info(
    'Seed complete: 4 regions, 13 zones, 2 sites, 2 routers, 6 cameras, ' +
      `${users.length} users, 1 escalation policy (${steps.length} steps), ` +
      `${rules.length} alert rules, 5 incidents, ${events.length} events, ` +
      `4 notifications, ${checks.length} health checks, ${snaps.length} snapshots, ` +
      '6 reference images, 6 SD statuses, 6 segments, 4 SIM usage rows, ' +
      `${qualityRows.length} quality rows, 3 streams, 3 clips, 2 layouts, ` +
      '2 maintenance windows, 3 tasks, 2 LIVE_VIEW grants, 4 system settings, ' +
      '1 backup. Run `npm run demo:media` to fetch media files.'
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
