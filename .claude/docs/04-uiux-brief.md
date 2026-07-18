# Aniston VMS — UI/UX Brief

**Doc version: v2.0 · 17 July 2026 · Built for plan v1.4**

| Doc changelog | |
|---|---|
| v1.0 | Dark ops-center theme |
| v2.0 | **Full redesign to the light "soft SaaS" reference** (`docs/actual-design.png`): slate sidebar, cream canvas, white rounded cards, sage/indigo/coral/sand accents, Poppins + Inter |

---

## 1. Design direction — replicate the reference

A reference screenshot is provided at **`docs/actual-design.png`** (a file-manager dashboard). **Replicate its layout system, spacing, color mood, and component shapes exactly** — but replace its content (folders/files/storage) with Aniston VMS content using the mapping in §8. The feel: light, calm, generously spaced, friendly-professional SaaS — rounded everything, soft shadows, pastel accent cards, one dark slate sidebar, dark charcoal only for video surfaces. This is a commercial product, not an admin panel.

## 2. Design tokens

**Colors (define as CSS variables / Tailwind theme):**

| Token | Hex | Use |
|---|---|---|
| `--canvas` | `#E8E8E6` | Page background behind the app frame |
| `--surface` | `#F6F5F1` | Main content background (cream) |
| `--card` | `#FFFFFF` | Cards, topbar controls, list rows |
| `--sidebar` | `#5C6672` | Sidebar background (slate gray-blue); text `#F3F4F5`, muted `#C6CCD2` |
| `--ink` | `#21201E` | Primary text |
| `--muted` | `#8A8F94` | Secondary text, icons |
| `--hairline` | `#ECEAE4` | Borders, dividers |
| `--sage` | `#8FBCA0` | Primary actions, healthy accents (hover `#7FAE92`, soft bg `#E7F1EA`) |
| `--indigo` | `#484C89` | Secondary accent cards, maintenance (soft `#E6E7F3`) |
| `--coral` | `#F25B3D` | Critical, alert pills (soft `#FDE7E1`) |
| `--sand` | `#EFE3C0` | Tertiary accent, warnings-soft (deep `#C9A94E`) |
| `--charcoal` | `#2B2724` | Video/player chrome, donut "dark" segment |

**Status semantics:** Healthy `#4E9C77` on `#E7F1EA` · Warning `#E2A93B` on `#FBF3DF` · Critical `#F25B3D` on `#FDE7E1` · Maintenance `#484C89` on `#E6E7F3` · Unknown `#9AA1A9` on `#F0F0EE`. Status dots are 8 px circles, exactly like the reference's sidebar folder dots.

**Type:** Display/headings **Poppins** 600–700 (page hero ~34–40 px, card titles 20 px); body/UI **Inter** 400/500/600 at 14–15 px; numbers tabular. **Icons:** lucide-react, 20 px, 1.5 px stroke, muted color. **Radii:** app frame 28 px · cards 20 px · inner tiles/list icons 14 px · buttons/inputs 12 px · pills 999. **Shadow:** `0 10px 30px rgba(33,32,30,.07)` (hover `.10`) — soft, never harsh. **Spacing:** 24 px card padding, 24 px grid gaps, whitespace is a feature. Light theme only in v1 (video chrome stays charcoal); dark mode later.

## 3. App frame

Viewport background `--canvas`. The app sits as a **rounded-[28px] shell** (max-width ~1440 px, centered, `overflow-hidden`, soft shadow) containing sidebar + content — exactly like the reference's floating card look. Below `lg` the shell goes edge-to-edge with radius 0.

## 4. Sidebar (left, ~260 px, `--sidebar`)

Top → bottom, mirroring the reference:
1. **Logo:** small mark + wordmark **"Aniston VMS"** in white.
2. **User block (centered):** circular avatar with a 2 px status ring (sage when platform healthy), name, small role chip ("Zone Engineer").
3. **Nav (icon + label, white text, active = white 10% pill):** Dashboard · Live Wall · Cameras · **Incidents** (coral count pill when >0) · **Zones ⌄** — expandable, sub-items are the user's scoped zones each with a **colored health dot** (sage/amber/coral), exactly like Marketing/Design/Webflow in the reference · Analytics · Clips · Reports · Admin (role-gated) · Settings.
4. **Bottom card:** dashed-border rounded card like the reference's "Add files" — **"Add camera"** with a white circular **+** button (admins; opens registration). Non-admins instead see a **platform-health chip**: "Platform Healthy · heartbeat 20 s".

## 5. Topbar (content area)

Left: **page title** (Poppins) + a **coral pill** beside it showing the live critical count ("Overview `● 3 Critical`") — the reference's red "185 GB" pill. Center: rounded **search** input with icon ("Search cameras, sites, incidents…"). Right: bell icon-button (unread dot), profile/logout icon-button, and **one sage primary CTA button** per page (reference's "Upgrade Plan" slot): Dashboard → "Open Live Wall" · Cameras → "+ Add Camera" (admin) · Incidents → "Export" · Reports → "New Report".

## 6. Page hero pattern

Every page opens with a large Poppins heading + one-line muted subtitle (the reference's "Manage your folders" block). Copy examples — Dashboard: **"Every camera, at a glance"** / "125 cameras across 13 Delhi zones — health, incidents and evidence in one place." · Cameras: **"Manage your cameras"** · Live Wall: **"Watch it live"** · Incidents: **"Fix what's failing."**

## 7. Signature dashboard layout (mirrors the reference exactly)

Row 1 — **Zone cards** (the folder-cards row): a dashed **"+ Add zone"** card (admin) → solid pastel **`ZoneCard`s**: corner index "01", kebab menu, white lucide `Cctv` icon, zone name, meta line "38 cameras · 2 critical". Tint by state: sage = all healthy, sand = warnings, coral-soft = has critical, indigo = maintenance-heavy. Trailing **photo card "Latest evidence"** (reference's "Your Gallery"): newest snapshot as the card image with dark gradient + label; opens the snapshot.

Row 2 — two white cards side by side:
- **`DonutCard` "Camera health"** (reference's Storage): donut in sage/sand/coral/indigo with **"92.8%"** centered (healthy share or uptime), kebab menu, 2×2 legend with dots + counts: Healthy 116 · Warning 5 · Critical 3 · Maintenance 1.
- **`ActivityListCard` "Recent incidents"** (reference's Last File): header + chevron filter ("Last 24 h ⌄"); rows = severity-tinted rounded-square icon (coral/amber/indigo) · title "CAM-042 · RTSP stream unavailable" · sub "Rohini Zone 4 · ANI-CAM-2026-000145" · **avatar stack** (assignee + notified, "+4" overflow — reference's shared-with avatars) · right-aligned "8 min ago". Row click opens the incident drawer.

Additional dashboard widgets (below, same white-card style): worst connections, weakest SIM signals, missing snapshots, SLA compliance.

## 8. Reference → VMS mapping table

| Reference element | Aniston VMS equivalent |
|---|---|
| "gig share" logo | Aniston VMS logo |
| Jennifer Rass avatar block | Logged-in user + role chip + status ring |
| Folders ▸ Marketing/Design/Webflow (colored dots) | Zones ▸ user's zones (health dots) |
| "Add files" dashed card + ⊕ | "Add camera" dashed card + ⊕ (admin) |
| "Overview" + red 185 GB pill | Page title + coral critical-count pill |
| "Upgrade Plan" sage button | Page primary CTA (sage) |
| "Manage your folders" hero | Page hero heading + subtitle |
| Folder cards 01/02 (green/indigo) | ZoneCards with camera/critical counts |
| "Your Gallery" photo card | "Latest evidence" snapshot card |
| Storage donut + GB legend | Camera-health donut + status counts |
| "Last File" list + avatars + dates | Recent incidents + engineer avatars + relative time |

## 9. Screens (all restyled to this system)

**A Dashboard** — §7. **B Zone dashboard** — hero = zone name; map card (white, rounded) with site pins; site cards row; zone donut + zone incidents list. **C Cameras** — filter chips row (white pills); grid of white `CameraCard`s: snapshot thumb (rounded-14), status dot + CAM-code, site, bitrate/FPS/signal in muted mono, open-incident coral chip; grid/list toggle. **D Camera detail** — hero with `HealthScoreRing` + `DiagnosisBanner` (soft status-tinted, full-width, plain-language cause); tabs (Overview · Health · Live · Playback · Incidents · Maintenance · Settings) as underlined pills; charts in white cards, sage/indigo lines. **E Live Wall** — charcoal stage area inside the light frame; layout picker (1×1/2×2/3×2) as segmented control; scope-filtered camera picker; saved-layout chips; tiles = compact PlayerShell with status overlay + kebab. **F Playback** — PlayerShell (charcoal) + light `TimelineScrubber` card below: 24 h bar, segments in indigo, gaps hairline, playhead coral, hover tooltip, zoom-to-hour, `ClipRangeSelector` sand handles; date picker with recording-density dots. **G Clips** — white cards like the reference file rows: thumb, camera, range, size, status chip, download, "Attach to incident". **H Incidents** — Kanban columns as soft-tinted headers; cards white; drawer = `SnapshotCompare`, `EscalationTimeline`, delivery statuses, actions. **I Alert delivery** — white table card, status chains as connected chips. **J Analytics** — quality/dust trend cards; **"Needs cleaning"** list styled like Recent-incidents rows with dust-score sparkline + auto-task link. **K Reports** — picker cards + preview + sage "Export". **L Zones** — `ZoneTree` (Region→Zone→Site→Camera) in a white card with health dots; move via drag or "Move to…" with confirmation; audit side panel. **M Admin** — users with `ScopeBadge` scope editor; per-zone recipients; maintenance-windows calendar; Platform-health tiles.

## 10. PlayerShell (YouTube-grade; charcoal chrome inside the light UI)

One component, three modes (live / wall-tile / playback). Video surface + control bar on `--charcoal`; controls white/`#EDEBE8`; accent coral for LIVE + playhead; sage for confirm actions.
- Controls: play/pause · seek bar with buffered ranges, hover **time tooltip + snapshot thumbnail preview** · time · speed menu (1×/2×/4×, 0.5× client-side) · quality (Auto / Sub 360p / HD where permitted) · PiP · fullscreen · settings; volume hidden when no audio; auto-hide on idle.
- **Live:** coral LIVE badge, latency chip, "Go to live", auto-reconnect with backoff + "Reconnecting…" overlay, frozen-frame warning state.
- **Playback:** TimelineScrubber docked below (light card, §9-F). Keyboard: Space, ←/→ ±10 s, ↑/↓ speed, F, M; mobile double-tap ±10 s.
- States: shimmer skeleton, buffering spinner, friendly error card ("Camera unreachable — Retry · View incident"), offline placeholder = last snapshot + timestamp. Never default browser controls.

## 11. Component inventory

`AppShell, Sidebar, SidebarZoneItem, TopBar, HeroHeader, PrimaryCTA, ZoneCard, EvidencePhotoCard, DonutCard, ActivityListCard, AvatarStack, CameraCard, StatusBadge, StatusDot, HealthScoreRing, DiagnosisBanner, VideoTile, LiveWallGrid, PlayerShell, TimelineScrubber, ClipRangeSelector, SnapshotCompare, IncidentKanban, EscalationTimeline, SimSignalIndicator, ConnectionQualityChart, ZoneTree, ScopeBadge, MaintenanceTaskCard, ReportExportBar, PlatformHealthTile, SearchInput, FilterChips`.

## 12. UX standards

Loading skeletons, guided empty states, retry-able errors on every list. Confirmation dialogs (stating consequences) for zone moves, failing-RTSP overrides, incident closure. Toasts with links for async jobs. IST times with relative hints ("8 min ago"). Scope is silent — out-of-scope content simply doesn't exist for the user. **Mobile:** shell edge-to-edge, sidebar becomes a slide-over (hamburger) + bottom tab bar (Dashboard · Wall · Cameras · Incidents); wall defaults 1×1/2×2; drawers become bottom sheets; incident actions thumb-reachable.

## 13. Style do / don't (keep Claude Code on-reference)

**Do:** cream surface + white cards everywhere; pastel fills only on accent cards (ZoneCards, chips); soft shadows; big radii; generous whitespace; Poppins only for display text; colored dots for status. **Don't:** default shadcn slate/dark palette; gradients (except photo-card overlays); harsh borders or 1 px gray boxes everywhere; dense tables without card wrapping; more than one sage primary button per view; dark backgrounds outside sidebar + video surfaces.
