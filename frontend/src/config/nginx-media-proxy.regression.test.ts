import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Regression guard for the Live Wall media-proxy redirect defect.
 *
 * MediaMTX emits Location headers — HLS 302 redirects and absolute URLs — that
 * reference its INTERNAL docker hostnames (`mediamtx:8888` for HLS, `mediamtx:8889`
 * for WebRTC). Nginx proxies `/media/hls|webrtc/` to those upstreams, so without
 * `proxy_redirect` rewrites the browser is handed a redirect to an unreachable
 * internal host and playback silently fails. That is the exact defect that blocked
 * CAM-007's Live Wall stream end-to-end.
 *
 * The fix rewrites those internal Locations back onto the browser-reachable
 * `/media/hls|webrtc/` prefixes. `frontend/nginx.conf` is COPYed into the frontend
 * image at build time (Dockerfile: `COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf`),
 * so this file IS the deployed artifact. If anyone drops these directives, this
 * test fails loudly before it ships.
 */
const nginxConf = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../nginx.conf'),
  'utf8'
);

/**
 * Extract the body of a `location <prefix> { ... }` block (brace-balanced) so
 * directives can be asserted per-block rather than anywhere in the file.
 */
function locationBody(conf: string, prefix: string): string {
  const start = conf.indexOf(`location ${prefix} {`);
  if (start === -1) throw new Error(`location ${prefix} not found in nginx.conf`);
  let depth = 0;
  for (let i = conf.indexOf('{', start); i < conf.length; i++) {
    if (conf[i] === '{') depth++;
    else if (conf[i] === '}' && --depth === 0) {
      return conf.slice(conf.indexOf('{', start) + 1, i);
    }
  }
  throw new Error(`unbalanced braces for location ${prefix}`);
}

describe('nginx media-proxy redirect rewrites (regression guard)', () => {
  it('rewrites the internal MediaMTX HLS host (mediamtx:8888) to /media/hls/', () => {
    expect(nginxConf).toMatch(/proxy_redirect\s+http:\/\/mediamtx:8888\/\s+\/media\/hls\/\s*;/);
  });

  it('rewrites the internal MediaMTX WebRTC host (mediamtx:8889) to /media/webrtc/', () => {
    expect(nginxConf).toMatch(/proxy_redirect\s+http:\/\/mediamtx:8889\/\s+\/media\/webrtc\/\s*;/);
  });

  it('rewrites root-relative redirects back under the /media/hls/ prefix', () => {
    expect(nginxConf).toMatch(
      /proxy_redirect\s+~\^\/\(\?!media\/\)\(\.\*\)\$\s+\/media\/hls\/\$1\s*;/
    );
  });

  it('rewrites root-relative redirects back under the /media/webrtc/ prefix', () => {
    expect(nginxConf).toMatch(
      /proxy_redirect\s+~\^\/\(\?!media\/\)\(\.\*\)\$\s+\/media\/webrtc\/\$1\s*;/
    );
  });
});

/**
 * Regression guard for the port-drop defect that caused CAM-009's Live Wall to
 * request http://localhost/media/hls/... (→ port 80 → ERR_CONNECTION_REFUSED).
 *
 * The proxy_redirect rewrites above produce a ROOT-RELATIVE Location
 * (`/media/hls/...`). nginx's default `absolute_redirect on` then re-expands that
 * into an ABSOLUTE URL using this container's own listen port (:80) instead of the
 * port the browser actually reached (docker-compose maps 5173->80). The browser is
 * handed http://localhost/... and connects to port 80, which is not published.
 *
 * `absolute_redirect off;` MUST be present in each media location block so the
 * Location stays relative and the browser resolves it against the real page origin
 * (scheme+host+port). Asserted per-block so disabling it in one block still fails.
 */
describe('nginx keeps media Location headers relative (port-drop regression guard)', () => {
  it.each(['/media/hls/', '/media/webrtc/'])(
    'disables absolute_redirect inside the %s location block',
    (prefix) => {
      const body = locationBody(nginxConf, prefix);
      expect(body).toMatch(/absolute_redirect\s+off\s*;/);
    }
  );

  it('does not re-enable absolute_redirect anywhere in the config', () => {
    expect(nginxConf).not.toMatch(/absolute_redirect\s+on\s*;/);
  });
});
