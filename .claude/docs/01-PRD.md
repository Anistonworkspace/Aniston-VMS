# Aniston VMS — Product Requirements Document (PRD)

**Doc version: v1.0 · 17 July 2026 · Built for plan v1.3**

---

## 1. Overview

**Aniston VMS (Aniston Video Management System)** is Aniston's independent platform for proving and managing the health of **125 CCTV cameras** deployed across Delhi on **Airtel SIM routers with public static IPs**. Two government recording servers already pull each camera's main RTSP stream; Aniston VMS never interferes with them. The platform gives Aniston: continuous evidence that every camera works (for SLA, billing, and government reporting), fast fault detection with the true root cause, alerting and escalation to the right zone team, live viewing, SD-card playback, and image-quality analytics — all scoped by zone.

## 2. Users & roles

Every user–role assignment carries an **access scope: All / Region(s) / Zone(s) / Site(s)**. A user only ever sees data inside their scope.

| Role | Can do | Typical scope |
|---|---|---|
| Super Administrator | Everything, all settings, user & scope management | All |
| Project Administrator | Manage registry, rules, users within scope | Region/Zone |
| Monitoring Operator | View dashboards, acknowledge incidents, run manual checks | Zone(s) |
| Maintenance Engineer | Work assigned incidents & maintenance tasks, update status | Zone(s) |
| Client Viewer | Read-only dashboards, reports, snapshots | Zone(s)/All |
| Auditor | Reports and audit logs only | All (read-only) |

## 3. Features

**F1 — Registry & zone hierarchy.** Region → Zone → Site → Camera. Seeded Delhi structure: North (Rohini, Civil Lines, Keshav Puram, Narela, Karol Bagh (CTSP)) · South (Central, Hauz Khas) · West (Rajouri Garden, Najafgarh) · East (Shahdara North 1, Shahdara North 2, Shahdara South 1, Shahdara South 2). Zones/sites are creatable and editable with map locations; sites can move between zones and cameras between sites — locations update everywhere, open incidents follow the camera, history keeps the zone recorded at event time, every move confirmed and audited.

**F2 — RTSP configuration.** Per-camera main/sub stream config with separate credential fields, format validation, **duplicate prevention** (unique on normalized host+port+path per stream type; conflicting camera named on rejection), "Test connection" before save, auto re-detection on change. Full URLs and passwords never reach the browser.

**F3 — Health monitoring.** 5-stage checks (router → camera network → RTSP auth → live video validation → image analysis) on a jittered schedule that never probes all 125 at once. Health score /100 (Router 20, RTSP 25, Video 25, Image 20, Config 10) and status Healthy / Warning / Critical / Maintenance / Unknown. A critical condition (e.g. black image) overrides the score.

**F4 — Root-cause diagnosis & connection quality.** Every fault labeled in plain language: Internet/SIM down at site · Weak SIM signal · Unstable network (packet loss) · Camera not responding (router online) · RTSP configuration problem · Stream degraded · Image problem. Per-camera connection-quality score (success rate, latency, jitter, signal) with history and per-zone aggregates.

**F5 — Snapshots.** Substream snapshot every 15 min; full-resolution evidence snapshot + analysis every hour; stored in S3/MinIO with thumbnails; retention 90 d originals / 3 y incident images / 1 y thumbnails; signed URLs only.

**F6 — Image analysis.** Detect black, white/overexposed, too dark/bright, blur, frozen, obstruction, scene shift vs approved reference, color cast, noise, **dust on lens**. Thresholds configurable per camera; breaches create incidents carrying the evidence image, score, threshold, and rule version.

**F7 — Image-quality analytics & cleaning tasks.** Quality/dust trends per camera and zone; "Needs cleaning" list (score beyond threshold N consecutive days) auto-creates a lens-cleaning **maintenance task** for the zone engineer, with before/after compare and a monthly image-quality report.

**F8 — Incidents.** One incident per confirmed problem, numbered `ANI-CAM-YYYY-NNNNNN`, lifecycle Detected → Confirmed → Alerted → Acknowledged → Assigned → Investigating → Resolved → Recovery-verified → Closed; deduplication, dependency suppression (router down suppresses its cameras), site grouping, maintenance windows.

**F9 — Email alerts.** Amazon SES, HTML templates with last-healthy vs current snapshot, delivery/bounce tracking, recipient levels by severity and zone.

**F10 — WhatsApp alerts.** Meta Cloud API with approved utility templates (Critical / Site outage / Recovery), full status tracking (queued→accepted→sent→delivered→read/failed), and an **Acknowledge button** that updates the incident and pauses reminders.

**F11 — Escalation.** 0/10/20/30/60-minute ladder (engineer → reminder → PM → ops head → senior mgmt/client), configurable per zone; acknowledgement pauses reminders but never hides the fault.

**F12 — Live view & wall.** Watch any camera live in the browser; multi-camera wall with 1×1 / 2×2 / 3×2 layouts (4–6 cameras) and saved layouts. Grid uses substreams only; single-camera HD on demand with bandwidth warning; session limits per camera and site; idle timeout with "Are you still watching?".

**F13 — SD-card playback.** Each camera has a 128 GB SD card. YouTube/NVR-style playback: per-day timeline of recorded segments, click-to-seek, 1×/2×/4× speed. Works per camera through ONVIF Profile G or brand adapter; unsupported cameras clearly marked (Fleet Capability report).

**F14 — Clip export.** Select a range (≤15 min) on the timeline → MP4 exported to S3 → downloadable via signed URL, attachable to incidents; clips library.

**F15 — SD-card health.** Hourly check: card present, capacity/free, recording enabled, newest segment age → alerts `SD_CARD_MISSING / SD_CARD_FULL / SD_RECORDING_STOPPED`.

**F16 — Reports & SLA.** Daily/weekly/monthly uptime per camera/site/zone, downtime, MTTA/MTTR, repeated-fault cameras, SIM performance, snapshot completeness, SLA violations vs configurable target, zone-wise image-quality & cleaning, engineer performance, audit; PDF + Excel export and scheduled email delivery.

**F17 — Zone-scoped RBAC, audit & self-monitoring.** Scope guard filters every query, stream, and notification; full audit log of every change; the platform monitors itself (scheduler heartbeat, queues, DB/Redis/S3/SES/WhatsApp, workers, disk, SSL) and raises internal alerts.

## 4. Non-goals (v1)

- Not a recording replacement — government servers remain the recorders; the SD card is the only playback source.
- No continuous third stream from any camera — everything is on-demand.
- No PTZ control, no person/vehicle analytics, no facial recognition.
- No billing engine — reports feed billing, they don't invoice.

## 5. Success metrics

- ≥99% of real outages detected within 5 minutes; false-alert rate <5%.
- MTTA <10 min; recovery auto-verified within 2 check cycles.
- Hourly snapshot completeness ≥98%.
- Live stream starts <5 s (substream); playback starts <8 s; dashboards load <2 s.
- Every incident carries a correct root-cause diagnosis and full alert-delivery trail.

## 6. Constraints & assumptions

- Airtel SIM upload is shared with two government main-stream pulls — bandwidth guardrails are mandatory.
- Camera brands are **mixed/unknown** → per-camera ONVIF capability detection; playback support varies per camera.
- Alerts run in **mock mode** (logged, not sent) until SES/WhatsApp credentials are provided.
- All timestamps stored UTC, displayed IST (Asia/Kolkata).
