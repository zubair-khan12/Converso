"use client";

import { useRouter } from "next/navigation";
import { Bell, ChevronDown, FileText, LogOut, Menu } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
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

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg)]/85 px-4 backdrop-blur lg:px-8">
      <button
        type="button"
        onClick={onOpenMobile}
        className="grid h-9 w-9 place-items-center rounded-lg text-[var(--ink)] hover:bg-[var(--surface-sunk)] lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex-1" />

      <a
        href="#"
        className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-sunk)] hover:text-[var(--ink)] sm:flex"
      >
        <FileText className="h-4 w-4" />
        Docs
      </a>

      <button
        type="button"
        className="relative grid h-9 w-9 place-items-center rounded-lg text-[var(--ink)] hover:bg-[var(--surface-sunk)]"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--amber)]" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-11 items-center gap-2.5 rounded-lg px-1.5 outline-none transition-colors hover:bg-[var(--surface-sunk)]">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-gradient-to-br from-[var(--yellow)] to-[var(--amber)] text-xs font-semibold text-[var(--amber-ink)]">
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
          <DropdownMenuLabel className="truncate font-normal text-[var(--ink-muted)]">
            {user.email}
          </DropdownMenuLabel>
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
