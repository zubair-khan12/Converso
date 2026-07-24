import { Bot, Clock, PhoneCall, Users, type LucideIcon } from "lucide-react";

import { AgentsPanel } from "@/components/dashboard/agents-panel";
import { Card, CardContent } from "@/components/ui/card";
import type { SessionUser } from "@/lib/types";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function StatCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[rgba(244,201,93,0.22)] text-[var(--amber-ink)]">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-[var(--ink-muted)]">{label}</p>
          <p className="mt-0.5 font-[family-name:var(--font-display)] text-2xl font-bold tabular-nums">
            {value}
          </p>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{note}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardContent({ user }: { user: SessionUser }) {
  const firstName =
    user.name?.split(/\s+/)[0] ?? user.email.split("@")[0] ?? "there";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-7">
      {/* Header */}
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight sm:text-3xl">
          {greeting()}, {firstName}! <span aria-hidden>👋</span>
        </h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Here&apos;s what&apos;s happening with your voice agents.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Bot} label="Total agents" value="—" note="Live once connected" />
        <StatCard icon={PhoneCall} label="Total calls" value="0" note="No calls yet" />
        <StatCard icon={Clock} label="Total minutes" value="0" note="No calls yet" />
        <StatCard icon={Users} label="Unique callers" value="0" note="No calls yet" />
      </div>

      <AgentsPanel />
    </div>
  );
}
