import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarCheck,
  CalendarDays,
  Clock,
  PhoneCall,
  PhoneMissed,
  Plus,
  ScrollText,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function EmptyState({
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

const QUICK_ACTIONS: { label: string; icon: LucideIcon; primary?: boolean }[] = [
  { label: "Create new agent", icon: Plus, primary: true },
  { label: "Upload knowledge", icon: Upload },
  { label: "Add phone number", icon: PhoneCall },
  { label: "Connect Cal.com", icon: CalendarCheck },
  { label: "View call logs", icon: ScrollText },
];

const CHECKLIST = [
  "Create your first voice agent",
  "Upload documents to its knowledge base",
  "Attach a phone number",
  "Connect Cal.com for booking",
];

export function DashboardContent({ user }: { user: SessionUser }) {
  const firstName =
    user.name?.split(/\s+/)[0] ?? user.email.split("@")[0] ?? "there";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight sm:text-3xl">
            {greeting()}, {firstName}! <span aria-hidden>👋</span>
          </h1>
          <p className="mt-1 text-[var(--ink-muted)]">
            Here&apos;s what&apos;s happening with your voice agents.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-sm font-medium text-[var(--ink-muted)]">
          <CalendarDays className="h-4 w-4" />
          This week
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Bot} label="Total agents" value="—" note="Live once connected" />
        <StatCard icon={PhoneCall} label="Total calls" value="0" note="No calls yet" />
        <StatCard icon={Clock} label="Total minutes" value="0" note="No calls yet" />
        <StatCard icon={Users} label="Unique callers" value="0" note="No calls yet" />
      </div>

      {/* Main grid */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Calls overview</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={BarChart3}
                title="No call data yet"
                body="Once your agents start taking calls, you'll see call volume and trends here."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">My agents</CardTitle>
              <Button
                size="sm"
                className="gap-1.5 bg-gradient-to-br from-[var(--yellow)] to-[var(--amber)] text-[var(--ink)] hover:opacity-95"
              >
                <Plus className="h-4 w-4" />
                New agent
              </Button>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={Bot}
                title="No agents to show yet"
                body="Create a voice agent, give it a personality and a knowledge base, then connect a number."
                action={
                  <Button variant="outline" className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    Create your first agent
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {QUICK_ACTIONS.map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.label}
                    type="button"
                    className={[
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      a.primary
                        ? "bg-[rgba(233,162,59,0.14)] text-[var(--amber-ink)] hover:bg-[rgba(233,162,59,0.22)]"
                        : "text-[var(--ink)] hover:bg-[var(--surface-sunk)]",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{a.label}</span>
                    <ArrowRight className="h-4 w-4 text-[var(--ink-muted)]" />
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Getting started</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {CHECKLIST.map((item, i) => (
                <div key={item} className="flex items-center gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[var(--border)] text-xs font-semibold text-[var(--ink-muted)]">
                    {i + 1}
                  </span>
                  <span className="text-sm text-[var(--ink)]">{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent calls</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={PhoneMissed}
                title="No calls yet"
                body="Your most recent calls will appear here."
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
