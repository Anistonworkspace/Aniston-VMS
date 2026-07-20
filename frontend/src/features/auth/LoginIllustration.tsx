// Self-contained inline SVG illustration for the sign-in "welcome" panel.
// Evokes the reference mock (two figures high-fiving on a soft stage) without
// pulling in any external asset or network dependency. Purely decorative.
export function LoginIllustration({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 320 300"
      className={className}
      role="img"
      aria-label="Two people celebrating with a high five"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Soft stage */}
      <ellipse cx="160" cy="238" rx="118" ry="26" fill="#ffffff" opacity="0.12" />
      <ellipse cx="160" cy="176" rx="96" ry="96" fill="#ffffff" opacity="0.08" />

      {/* Sparkles */}
      <g fill="#f4d47c" opacity="0.9">
        <path d="M160 70l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" />
        <circle cx="96" cy="104" r="3" />
        <circle cx="228" cy="120" r="3.5" />
        <circle cx="120" cy="70" r="2.5" />
        <circle cx="210" cy="78" r="2.5" />
      </g>

      {/* Left figure */}
      <g>
        <path d="M118 236l-6-58a20 20 0 0140 0l-6 58z" fill="#e0876c" />
        <rect x="112" y="150" width="34" height="52" rx="16" fill="#3d99f0" />
        {/* raised arm to the high-five point */}
        <path
          d="M142 158c14-6 26-16 34-28"
          stroke="#f0b99f"
          strokeWidth="11"
          strokeLinecap="round"
        />
        <circle cx="129" cy="132" r="18" fill="#f0b99f" />
        <path d="M111 128a18 18 0 0136 0c-6-6-12-9-18-9s-12 3-18 9z" fill="#1e3a5f" />
      </g>

      {/* Right figure */}
      <g>
        <path d="M202 236l6-58a20 20 0 00-40 0l6 58z" fill="#243b6b" />
        <rect x="174" y="150" width="34" height="52" rx="16" fill="#5aa9ef" />
        {/* raised arm to the high-five point */}
        <path
          d="M178 158c-14-6-26-16-34-28"
          stroke="#f0b99f"
          strokeWidth="11"
          strokeLinecap="round"
        />
        <circle cx="191" cy="132" r="18" fill="#f0b99f" />
        <path d="M173 130a18 18 0 0136-4c-7-5-13-7-19-6s-11 4-17 10z" fill="#5a4a3a" />
      </g>

      {/* High-five spark */}
      <g transform="translate(160 128)">
        <path d="M0-13l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" fill="#ffffff" />
      </g>

      {/* Feet */}
      <ellipse cx="120" cy="238" rx="10" ry="4" fill="#243b6b" />
      <ellipse cx="146" cy="238" rx="10" ry="4" fill="#243b6b" />
      <ellipse cx="174" cy="238" rx="10" ry="4" fill="#c56b52" />
      <ellipse cx="200" cy="238" rx="10" ry="4" fill="#c56b52" />
    </svg>
  );
}
