import { cn } from "@/lib/utils"

/**
 * State encoded as shape + colour, so "this one needs attention" reads at a
 * glance without parsing text. Agents, documents and phone numbers all had
 * their own copy of this; the tones are semantic (not brand accent) so a
 * palette change can't accidentally make "failed" look like "fine".
 */
export type PillTone = "success" | "pending" | "danger" | "neutral" | "accent"

const TONES: Record<PillTone, string> = {
  success: "bg-[var(--success-soft)] text-[var(--success-ink)]",
  pending: "bg-[var(--accent-soft)] text-[var(--amber-ink)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
  neutral: "bg-[var(--surface-sunk)] text-[var(--ink-muted)]",
  accent: "bg-[var(--accent-soft)] text-[var(--amber-ink)]",
}

export function StatusPill({
  tone,
  children,
  dot = true,
  className,
}: {
  tone: PillTone
  children: React.ReactNode
  /** A leading dot suits live/failed state; icons read better without it. */
  dot?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        TONES[tone],
        className
      )}
    >
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}
