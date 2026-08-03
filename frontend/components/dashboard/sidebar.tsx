"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, Lock, X } from "lucide-react";

import { Logo, LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { NAV } from "./nav";

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  /** Tabs marked `requiresVapi` stay locked until this is true. */
  vapiConnected: boolean;
};

const rowBase =
  "group relative flex items-center gap-3 rounded-[var(--radius)] px-3 py-2.5 text-sm font-medium transition-colors";

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  vapiConnected,
}: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 bg-[var(--navy)]/40 backdrop-blur-[2px] lg:hidden"
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-[width,transform] duration-200 ease-out",
          collapsed ? "w-[76px]" : "w-[264px]",
          mobileOpen ? "translate-x-0 shadow-[var(--shadow-lg)]" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Brand */}
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
          <Link href="/dashboard" onClick={onCloseMobile} aria-label="Converso dashboard">
            {collapsed ? <LogoMark className="h-9 w-9" /> : <Logo subtitle="Voice agents" />}
          </Link>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close menu"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius)] text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-sunk)] hover:text-[var(--ink)] lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {NAV.map((section, sectionIndex) => (
            <div key={section.title ?? "root"} className={cn(sectionIndex > 0 && "mt-5")}>
              {section.title && !collapsed && (
                <p className="px-3 pb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-[var(--ink-subtle)]">
                  {section.title}
                </p>
              )}
              {/* Collapsed, the label is gone, so a rule carries the grouping
                  instead — otherwise every item runs together. */}
              {section.title && collapsed && (
                <div aria-hidden className="mx-3 mb-2 border-t border-[var(--border)]" />
              )}

              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  const needsVapi = item.requiresVapi && !vapiConnected;
                  const locked = item.soon || needsVapi;

                  const inner = (
                    <>
                      {/* Active rail: reads at a glance even in the collapsed
                          rail where the label is hidden. */}
                      {active && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--amber)]"
                        />
                      )}
                      <Icon className="h-5 w-5 shrink-0" />
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {!collapsed && item.soon && (
                        <span className="rounded-full bg-[var(--surface-sunk)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-subtle)]">
                          Soon
                        </span>
                      )}
                      {!collapsed && needsVapi && <Lock className="h-3.5 w-3.5 shrink-0" />}
                    </>
                  );

                  if (locked) {
                    const title = item.soon
                      ? collapsed
                        ? `${item.label} — launching soon`
                        : "Launching soon"
                      : "Connect Vapi to unlock this tab";
                    return (
                      <div
                        key={item.href}
                        title={title}
                        className={cn(
                          rowBase,
                          "cursor-not-allowed text-[var(--ink-subtle)]",
                          collapsed && "justify-center",
                        )}
                      >
                        {inner}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onCloseMobile}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        rowBase,
                        collapsed && "justify-center",
                        active
                          ? "bg-[var(--accent-soft)] font-semibold text-[var(--amber-ink)]"
                          : "text-[var(--ink)] hover:bg-[var(--surface-sunk)]",
                      )}
                    >
                      {inner}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Plan card + collapse */}
        <div className="shrink-0 border-t border-[var(--border)] p-3">
          {!collapsed && (
            <div className="mb-2 rounded-[calc(var(--radius)*1.4)] border border-[var(--border)] bg-[var(--surface-sunk)] p-4">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--ink-subtle)]">
                Current plan
              </p>
              <p className="mt-0.5 font-[family-name:var(--font-display)] text-lg font-bold text-[var(--navy)]">
                Starter
              </p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">
                Free while in development.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "hidden w-full items-center gap-2 rounded-[var(--radius)] px-3 py-2.5 text-sm font-medium text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-sunk)] hover:text-[var(--ink)] lg:flex",
              collapsed && "justify-center",
            )}
          >
            {collapsed ? (
              <ChevronsRight className="h-5 w-5" />
            ) : (
              <>
                <ChevronsLeft className="h-5 w-5" />
                Collapse
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
