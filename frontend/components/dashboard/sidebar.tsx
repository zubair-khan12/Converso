"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { NAV } from "./nav";

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

const rowBase =
  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors";

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[var(--border)] bg-white transition-[width,transform] duration-200 ease-out",
          collapsed ? "w-[76px]" : "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Brand */}
        <Link
          href="/dashboard"
          onClick={onCloseMobile}
          className="flex h-16 shrink-0 items-center gap-2.5 px-4"
        >
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[var(--yellow)] to-[var(--amber)] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.4)]"
          >
            <Sparkles className="h-4 w-4 text-[var(--amber-ink)]" />
          </span>
          {!collapsed && (
            <span className="leading-tight">
              <span className="block font-[family-name:var(--font-display)] text-base font-bold tracking-tight">
                Converso
              </span>
              <span className="block text-xs text-[var(--ink-muted)]">
                Voice Agents
              </span>
            </span>
          )}
        </Link>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;

            const inner = (
              <>
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                {!collapsed && item.soon && (
                  <span className="rounded-full bg-[var(--surface-sunk)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                    Soon
                  </span>
                )}
              </>
            );

            if (item.soon) {
              return (
                <div
                  key={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    rowBase,
                    "cursor-not-allowed text-[var(--ink-muted)]/60",
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
                className={cn(
                  rowBase,
                  collapsed && "justify-center",
                  active
                    ? "bg-[rgba(233,162,59,0.14)] font-semibold text-[var(--amber-ink)]"
                    : "text-[var(--ink)] hover:bg-[var(--surface-sunk)]",
                )}
              >
                {inner}
              </Link>
            );
          })}
        </nav>

        {/* Plan card + collapse */}
        <div className="shrink-0 border-t border-[var(--border)] p-3">
          {!collapsed && (
            <div className="mb-2 rounded-2xl bg-[var(--surface-sunk)] p-4">
              <p className="text-xs text-[var(--ink-muted)]">Current plan</p>
              <p className="font-[family-name:var(--font-display)] text-lg font-bold">
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
            className={cn(
              "hidden w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-sunk)] hover:text-[var(--ink)] lg:flex",
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
