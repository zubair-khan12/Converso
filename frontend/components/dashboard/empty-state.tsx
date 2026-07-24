import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--surface-sunk)] text-[var(--ink-muted)]">
        <Icon className="h-6 w-6" />
      </span>
      <p className="font-semibold text-[var(--ink)]">{title}</p>
      <p className="max-w-sm text-sm text-[var(--ink-muted)]">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
