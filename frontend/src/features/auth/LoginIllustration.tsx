// Self-contained inline SVG illustration for the sign-in "welcome" panel.
// Evokes the reference mock — an intelligent security camera watching over a
// connected network of sites — without pulling in any external asset or
// network dependency. Purely decorative; colours reuse the --auth-* palette.
export function LoginIllustration({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 420 360"
      className={className}
      role="img"
      aria-label="A smart security camera monitoring a connected network of sites"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="li-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d5e5f4" />
        </linearGradient>
        <linearGradient id="li-hood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3f8fd" />
          <stop offset="1" stopColor="#c7dcef" />
        </linearGradient>
        <radialGradient id="li-lens" cx="0.4" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#3f7fb8" />
          <stop offset="0.55" stopColor="#183a5c" />
          <stop offset="1" stopColor="#0c1e34" />
        </radialGradient>
        <linearGradient id="li-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dcebf8" />
        </linearGradient>
        <radialGradient id="li-hub" cx="0.5" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dcecfa" />
        </radialGradient>
        <pattern id="li-dots" width="15" height="15" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.5" fill="#8fb4d6" />
        </pattern>
        <radialGradient id="li-fade" cx="0.5" cy="0.4" r="0.62">
          <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="0.65" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <mask id="li-fademask">
          <rect x="0" y="0" width="420" height="360" fill="url(#li-fade)" />
        </mask>
      </defs>

      {/* Dotted network backdrop, faded toward the edges */}
      <g mask="url(#li-fademask)" opacity="0.5">
        <rect x="10" y="6" width="400" height="210" fill="url(#li-dots)" />
      </g>

      {/* Ground platform */}
      <ellipse cx="210" cy="322" rx="168" ry="26" fill="#cfe1f1" opacity="0.55" />

      {/* ── Security camera ─────────────────────────────── */}
      <g transform="rotate(-7 232 120)">
        {/* Wall plate + mounting arm */}
        <rect x="336" y="86" width="14" height="70" rx="5" fill="#c4d5e6" />
        <rect x="300" y="116" width="46" height="14" rx="7" fill="#d3e2f0" />
        <circle cx="343" cy="121" r="4" fill="#a9c0d6" />
        {/* Sunshield / hood */}
        <rect x="150" y="86" width="150" height="18" rx="9" fill="url(#li-hood)" />
        {/* Body */}
        <rect
          x="156"
          y="98"
          width="164"
          height="62"
          rx="31"
          fill="url(#li-body)"
          stroke="#cfe0f0"
          strokeWidth="1.5"
        />
        {/* Body highlight */}
        <rect x="170" y="106" width="120" height="6" rx="3" fill="#ffffff" opacity="0.7" />
        {/* Rear status LED */}
        <circle cx="298" cy="129" r="3.5" fill="#168c8c" />
        {/* Lens housing */}
        <circle cx="176" cy="129" r="35" fill="#eaf2fa" stroke="#cbdcee" strokeWidth="1.5" />
        <circle cx="176" cy="129" r="27" fill="url(#li-lens)" />
        <circle cx="176" cy="129" r="27" fill="none" stroke="#0c1e34" strokeWidth="2" />
        <circle
          cx="176"
          cy="129"
          r="31"
          fill="none"
          stroke="#168c8c"
          strokeOpacity="0.45"
          strokeWidth="2"
        />
        <circle cx="167" cy="120" r="7" fill="#9fd0ee" opacity="0.85" />
        <circle cx="184" cy="138" r="3" fill="#3f67d8" opacity="0.7" />
      </g>

      {/* ── Network topology ────────────────────────────── */}
      {/* Connectors */}
      <g stroke="#9db9d4" strokeWidth="2" strokeDasharray="1 7" strokeLinecap="round">
        <path d="M210 250 L110 286" />
        <path d="M210 250 L206 314" />
        <path d="M210 250 L305 296" />
      </g>
      {/* Connector accent dots */}
      <circle cx="160" cy="268" r="3.5" fill="#e2a93b" />
      <circle cx="208" cy="282" r="3.5" fill="#168c8c" />
      <circle cx="258" cy="273" r="3.5" fill="#e2a93b" />

      {/* Hub tile (radar) */}
      <g>
        <rect
          x="180"
          y="222"
          width="60"
          height="56"
          rx="16"
          fill="url(#li-hub)"
          stroke="#d3e2f0"
          strokeWidth="1.5"
        />
        <circle
          cx="210"
          cy="250"
          r="18"
          fill="none"
          stroke="#168c8c"
          strokeOpacity="0.25"
          strokeWidth="2"
        />
        <circle
          cx="210"
          cy="250"
          r="11"
          fill="none"
          stroke="#168c8c"
          strokeOpacity="0.5"
          strokeWidth="2"
        />
        <circle cx="210" cy="250" r="4.5" fill="#168c8c" />
      </g>

      {/* Left building tile */}
      <g>
        <rect
          x="82"
          y="262"
          width="52"
          height="48"
          rx="13"
          fill="url(#li-tile)"
          stroke="#d3e2f0"
          strokeWidth="1.5"
        />
        <rect x="96" y="278" width="10" height="18" rx="1.5" fill="#3f67d8" opacity="0.85" />
        <rect x="110" y="273" width="12" height="23" rx="1.5" fill="#142b4a" opacity="0.85" />
        <rect x="99" y="281" width="3" height="3" fill="#ffffff" />
        <rect x="114" y="277" width="3" height="3" fill="#ffffff" />
      </g>

      {/* Bottom building tile */}
      <g>
        <rect
          x="180"
          y="298"
          width="52"
          height="48"
          rx="13"
          fill="url(#li-tile)"
          stroke="#d3e2f0"
          strokeWidth="1.5"
        />
        <rect x="194" y="312" width="24" height="24" rx="2" fill="#168c8c" opacity="0.85" />
        <rect x="199" y="317" width="4" height="4" fill="#ffffff" />
        <rect x="209" y="317" width="4" height="4" fill="#ffffff" />
        <rect x="199" y="326" width="4" height="4" fill="#ffffff" />
        <rect x="209" y="326" width="4" height="4" fill="#ffffff" />
      </g>

      {/* Right location-pin tile */}
      <g>
        <rect
          x="280"
          y="272"
          width="52"
          height="48"
          rx="13"
          fill="url(#li-tile)"
          stroke="#d3e2f0"
          strokeWidth="1.5"
        />
        <path
          d="M306 284c-7 0-12 5-12 12 0 8 12 18 12 18s12-10 12-18c0-7-5-12-12-12z"
          fill="#3f67d8"
        />
        <circle cx="306" cy="296" r="4.5" fill="#ffffff" />
      </g>

      {/* Floating accents */}
      <circle cx="70" cy="150" r="3" fill="#168c8c" opacity="0.6" />
      <circle cx="356" cy="196" r="3.5" fill="#3f67d8" opacity="0.55" />
      <circle cx="330" cy="150" r="2.5" fill="#e2a93b" opacity="0.7" />
      <circle cx="96" cy="210" r="2.5" fill="#3f67d8" opacity="0.5" />
    </svg>
  );
}
