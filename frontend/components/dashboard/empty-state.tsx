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
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center sm:py-16">
      <span className="mb-1 grid h-14 w-14 place-items-center rounded-[calc(var(--radius)*1.4)] bg-[var(--surface-sunk)] text-[var(--ink-subtle)]">
        <Icon className="h-6 w-6" />
      </span>
      <p className="font-[family-name:var(--font-display)] text-base font-bold">{title}</p>
      <p className="max-w-sm text-sm text-[var(--ink-muted)] text-pretty">{body}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
