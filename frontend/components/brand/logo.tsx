import { cn } from "@/lib/utils";

/**
 * The Converso mark, redrawn as vector so it stays crisp at 24px in a topbar
 * and 44px on the login card, inherits the brand tokens, and costs no network
 * request.
 *
 * The shape is the supplied logo's: a "C" that is also a speech bubble — navy
 * sweeping up into gold — with the voice waveform escaping through its
 * aperture. Two things are tuned away from the source artwork so it survives
 * being small: the stroke is thinner relative to the aperture, and there are
 * four waveform bars rather than five, because at 24px five bars close up into
 * a solid block.
 *
 * `tone="light"` swaps the navy for white — on the navy login panel the
 * default mark would be half-invisible.
 */
export function LogoMark({
  className,
  tone = "default",
}: {
  className?: string;
  tone?: "default" | "light";
}) {
  const light = tone === "light";
  const ink = light ? "#ffffff" : "var(--navy)";
  const gradientId = light ? "converso-c-light" : "converso-c";

  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-hidden
      focusable="false"
      className={cn("h-8 w-8", className)}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="48"
          y1="10"
          x2="18"
          y2="58"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="var(--gold)" />
          <stop offset="0.5" stopColor="var(--amber)" />
          <stop offset="1" stopColor={ink} />
        </linearGradient>
      </defs>

      {/* The C / speech bubble, open to the right so the waveform reads as
          sound leaving the mouth of it. */}
      <path
        d="M46.9 16.4 A 21 21 0 1 0 46.9 47.6"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="9.5"
        strokeLinecap="round"
      />
      {/* Bubble tail, springing from the lower-left of the stroke. */}
      <path d="M20.5 46.2 L10 58.5 L27 52.5 Z" fill={ink} />

      {/* Waveform: grounded in the ink colour, carrying out in gold. */}
      <g>
        <rect x="24.5" y="26" width="4" height="12" rx="2" fill={ink} />
        <rect x="31.5" y="20.5" width="4" height="23" rx="2" fill={ink} />
        <rect x="38.5" y="24.5" width="4" height="15" rx="2" fill="var(--gold)" />
        <rect x="45.5" y="28.5" width="4" height="7" rx="2" fill="var(--gold)" />
      </g>
    </svg>
  );
}

/**
 * Mark + wordmark lockup. `subtitle` renders the product line under the name
 * (used in the sidebar, where the extra line earns its space); omit it for
 * tight placements like the topbar.
 */
export function Logo({
  className,
  subtitle,
  size = "md",
  tone = "default",
}: {
  className?: string;
  subtitle?: string;
  size?: "sm" | "md" | "lg";
  tone?: "default" | "light";
}) {
  const wordSize =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-lg";
  const markSize = size === "lg" ? "h-11 w-11" : size === "sm" ? "h-8 w-8" : "h-9 w-9";

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark tone={tone} className={cn(markSize, "shrink-0")} />
      <span className="leading-tight">
        <span
          className={cn(
            "block font-[family-name:var(--font-display)] font-extrabold tracking-[-0.03em]",
            tone === "light" ? "text-white" : "text-[var(--navy)]",
            wordSize,
          )}
        >
          converso
        </span>
        {subtitle && (
          <span
            className={cn(
              "block text-[0.7rem] font-medium uppercase tracking-[0.12em]",
              tone === "light" ? "text-white/60" : "text-[var(--ink-subtle)]",
            )}
          >
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
