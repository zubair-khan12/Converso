import Link from "next/link";
import {
  ArrowRight,
  Blocks,
  BookOpen,
  Bot,
  Clock,
  PhoneCall,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SessionUser } from "@/lib/types";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * These read "—" or "0" until call logging lands. They're shown rather than
 * hidden because the shape of the dashboard shouldn't change under someone
 * the first time a call comes in — but the note under each number says
 * plainly that there's nothing behind it yet.
 */
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
    <Card className="[--card-spacing:1.25rem]">
      <CardContent className="flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius)] bg-[var(--accent-soft)] text-[var(--amber-ink)]">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--ink-subtle)]">
            {label}
          </p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-[1.75rem] font-extrabold leading-none tabular-nums text-[var(--navy)]">
            {value}
          </p>
          <p className="mt-1.5 text-xs text-[var(--ink-muted)]">{note}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ShortcutCard({
  icon: Icon,
  title,
  body,
  href,
  cta,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <Card className="[--card-spacing:1.25rem]">
      <CardContent className="flex h-full flex-col items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius)] bg-[var(--accent-soft)] text-[var(--amber-ink)]">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="font-[family-name:var(--font-display)] text-[0.9375rem] font-bold">
            {title}
          </p>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">{body}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={href} />}
          nativeButton={false}
          className="mt-auto -ml-3 text-[var(--amber-ink)]"
        >
          {cta}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

export function DashboardContent({ user }: { user: SessionUser }) {
  const firstName =
    user.name?.split(/\s+/)[0] ?? user.email.split("@")[0] ?? "there";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">
            {greeting()}, {firstName}
          </h1>
          <p className="page-sub">
            Here&apos;s what&apos;s happening with your voice agents.
          </p>
        </div>
        <Button
          variant="brand"
          render={<Link href="/dashboard/agents" />}
          nativeButton={false}
          className="w-full sm:w-auto"
        >
          Manage agents
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Bot} label="Total agents" value="—" note="Live once connected" />
        <StatCard icon={PhoneCall} label="Total calls" value="0" note="No calls yet" />
        <StatCard icon={Clock} label="Total minutes" value="0" note="No calls yet" />
        <StatCard icon={Users} label="Unique callers" value="0" note="No calls yet" />
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-bold tracking-[-0.02em]">Pick up where you left off</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ShortcutCard
            icon={Bot}
            title="Voice agents"
            body="Create, edit, and test the agents that answer your calls."
            href="/dashboard/agents"
            cta="Open agents"
          />
          <ShortcutCard
            icon={BookOpen}
            title="Knowledge base"
            body="Feed an agent your documents so it answers from what you know."
            href="/dashboard/knowledge"
            cta="Add knowledge"
          />
          <ShortcutCard
            icon={Blocks}
            title="Integrations"
            body="Let an agent check your calendar and book the meeting mid-call."
            href="/dashboard/integrations"
            cta="Connect a tool"
          />
        </div>
      </section>
    </div>
  );
}
