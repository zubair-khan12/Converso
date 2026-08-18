/** Shown when a widget can't load. Plain, quiet, and no branding — it renders
 *  inside a stranger's page, and a loud error there is worse than a small one. */
export function WidgetRefusal({ message }: { message: string }) {
  return (
    <div className="grid h-dvh place-items-center bg-[var(--surface)] p-6">
      <p className="max-w-xs text-center text-sm text-[var(--ink-muted)]">
        {message}
      </p>
    </div>
  );
}
