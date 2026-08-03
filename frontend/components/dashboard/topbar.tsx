"use client";

import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown, LogOut, Menu } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { NAV } from "./nav";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionUser } from "@/lib/types";

function initials(user: SessionUser) {
  const source = user.name?.trim() || user.email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function Topbar({
  user,
  onOpenMobile,
}: {
  user: SessionUser;
  onOpenMobile: () => void;
}) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/");
    router.refresh();
  }

  const pathname = usePathname();
  // The mobile header loses the sidebar, and with it any sense of where you
  // are — so the current tab's name takes the space instead.
  const current = NAV.flatMap((s) => s.items).find((i) => i.href === pathname);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg)]/85 px-4 backdrop-blur sm:gap-3 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onOpenMobile}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius)] text-[var(--ink)] transition-colors hover:bg-[var(--surface-sunk)] lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <LogoMark className="h-8 w-8 shrink-0 sm:hidden" />

      {current && (
        <p className="truncate font-[family-name:var(--font-display)] text-base font-bold tracking-[-0.02em] lg:hidden">
          {current.label}
        </p>
      )}

      <div className="flex-1" />

      <button
        type="button"
        className="relative grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius)] text-[var(--ink)] transition-colors hover:bg-[var(--surface-sunk)]"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-[var(--amber)]" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-11 shrink-0 items-center gap-2.5 rounded-[var(--radius)] px-1.5 outline-none transition-colors hover:bg-[var(--surface-sunk)]">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-[linear-gradient(135deg,var(--gold),var(--amber))] text-xs font-bold text-white">
              {initials(user)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-semibold text-[var(--ink)]">
              {user.name || user.email}
            </span>
            <span className="block text-xs capitalize text-[var(--ink-muted)]">
              {user.role}
            </span>
          </span>
          <ChevronDown className="hidden h-4 w-4 text-[var(--ink-muted)] sm:block" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* Base UI requires GroupLabel to sit inside a Group — without this
              wrapper it throws "MenuGroupContext is missing" on render. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="truncate font-normal text-[var(--ink-muted)]">
              {user.email}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={logout}>
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
