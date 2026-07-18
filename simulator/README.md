# Aniston VMS — Camera Simulator

Runs a [MediaMTX](https://github.com/bluenviron/mediamtx) media server plus 6
ffmpeg publishers that loop a generated `testsrc2` test pattern into it as
RTSP, standing in for cameras `CAM-001`..`CAM-006` (paths `cam-001`..
`cam-006`) so the whole backend — health checks, snapshot capture, playback/
clip export, live view — can be exercised end-to-end with zero real hardware.

## Start the simulator

Standalone (recommended for local dev — brings up MediaMTX + all 6 fake
cameras):

```sh
docker compose -f simulator/docker-compose.sim.yml up -d
```

Or, if you only want MediaMTX itself alongside the rest of the stack (no fake
camera publishers), the main compose file also exposes it behind a profile:

```sh
docker compose -f docker-compose.fullstack.yml --profile sim up -d
```

## Ports

| Port | Protocol | Purpose                                  |
| ---- | -------- | ----------------------------------------- |
| 8554 | RTSP     | `rtsp://localhost:8554/cam-00N`            |
| 8888 | HLS      | `http://localhost:8888/cam-00N/index.m3u8` |
| 8889 | WebRTC   | `http://localhost:8889/cam-00N`            |
| 9997 | HTTP API | MediaMTX control/introspection API         |

## Wiring it into the backend

Point the backend at the simulator via these env vars (all already
zod-validated with safe defaults in `backend/src/config/env.ts`, so the app
boots fine even without the simulator running):

```
MEDIAMTX_API_URL=http://localhost:9997
MEDIAMTX_RTSP_URL=rtsp://localhost:8554
MEDIAMTX_HLS_URL=http://localhost:8888
MEDIAMTX_WEBRTC_URL=http://localhost:8889
```

When onboarding the 6 simulated cameras through the hierarchy API (or a seed
script), set each camera's `mainRtspUrl` to
`rtsp://mediamtx:8554/cam-00N` (from inside the docker network) or
`rtsp://localhost:8554/cam-00N` (from the host), with `cameraCode` set to the
matching `CAM-00N` so `HEALTH_SIM_MODE` / `PLAYBACK_SIM_MODE` fault injection
below lines up correctly. Any RTSP username/password can be used — the
simulator's MediaMTX config does not require auth.

## Fault injection

The backend's health checkers read a Redis key `sim:fault:<cameraCode>` when
`HEALTH_SIM_MODE=true` and synthesize the corresponding failure/diagnosis
instead of probing real hardware (see
`backend/src/modules/health/health.checkers.ts`). Two equivalent wrapper
scripts are provided around `redis-cli SET sim:fault:CAM-00X <FAULT>`:

```sh
# bash / macOS / Linux / WSL
./fault-inject.sh CAM-001 CAMERA_OFFLINE
./fault-inject.sh CAM-001 clear
./fault-inject.sh --list
```

```powershell
# Windows PowerShell
./fault-inject.ps1 -CameraCode CAM-001 -Fault CAMERA_OFFLINE
./fault-inject.ps1 -CameraCode CAM-001 -Fault clear
./fault-inject.ps1 -List
```

Valid `<FAULT>` values (must match the backend's `SimFault` union exactly):

| Fault                | Simulated diagnosis                                |
| -------------------- | --------------------------------------------------- |
| `SITE_INTERNET_DOWN` | Router/site-level TCP check fails first              |
| `SIM_SIGNAL_ISSUE`   | Weak cellular signal on a SIM-backed router          |
| `NETWORK_UNSTABLE`   | Intermittent packet loss / high jitter               |
| `CAMERA_OFFLINE`     | RTSP port refuses connections                        |
| `CONFIG_ERROR`       | RTSP auth fails (bad credentials)                    |
| `STREAM_DEGRADED`    | Stream connects but frame rate/bitrate is degraded    |
| `IMAGE_PROBLEM`      | Stream connects but decoded frame looks black/frozen  |

Both scripts default to `localhost:6379` (override with `REDIS_HOST`/
`REDIS_PORT` env vars for bash, or `-RedisHost`/`-RedisPort` params for
PowerShell); point them at whatever Redis instance your backend is using
(the same one configured via `REDIS_URL` in `backend/.env`).

Clearing a fault (`clear`) removes the Redis key entirely, after which the
next scheduled health check reports the camera healthy again (assuming the
simulator's actual RTSP stream is still up).

## Notes

- The 6 ffmpeg containers use `libx264` (ultrafast/zerolatency) over a
  `testsrc2` lavfi source plus a low-volume sine tone, so each camera gets a
  distinguishable picture and a valid audio track without any external test
  assets.
- `docker-compose.sim.yml` is intentionally separate from
  `docker-compose.fullstack.yml` per the project's stated scope (only an
  optional `mediamtx` service was added to the fullstack file, gated behind
  the `sim` profile, so `docker compose -f docker-compose.fullstack.yml up`
  with no profile is completely unaffected).
- This directory does not touch `frontend/`, `shared/src`, or any existing
  compose services.
