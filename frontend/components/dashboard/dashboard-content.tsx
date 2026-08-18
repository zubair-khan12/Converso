import Link from "next/link";
import {
  ArrowRight,
  Blocks,
  BookOpen,
  Bot,
  Clock,
  MessagesSquare,
  PhoneCall,
  PhoneIncoming,
  Users,
  type LucideIcon,
} from "lucide-react";

import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import type { CallLogEntry, DashboardSummary, SessionUser } from "@/lib/types";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** "—" when the summary is missing entirely, so an unreachable backend never
 *  reads as a genuine zero. */
function stat(value: number | undefined): string {
  return value === undefined ? "—" : value.toLocaleString();
}

function duration(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

function when(iso: string | null): string {
  if (!iso) return "Not started";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const CALL_TONE: Record<CallLogEntry["status"], PillTone> = {
  completed: "success",
  active: "pending",
  failed: "danger",
};

const CALL_LABEL: Record<CallLogEntry["status"], string> = {
  completed: "Completed",
  active: "In progress",
  failed: "Failed",
};

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

function CallRow({ call }: { call: CallLogEntry }) {
  const who =
    call.caller_number ??
    (call.direction === "web" ? "Web test call" : "Unknown caller");

  return (
    <li className="flex items-center justify-between gap-4 border-t border-[var(--border)] px-5 py-3 first:border-t-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--ink)]">{who}</p>
        <p className="truncate text-xs text-[var(--ink-muted)]">
          {call.agent_name ?? "Deleted agent"} · {when(call.started_at)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm tabular-nums text-[var(--ink-muted)]">
          {duration(call.duration_seconds)}
        </span>
        <StatusPill tone={CALL_TONE[call.status]}>
          {CALL_LABEL[call.status]}
        </StatusPill>
      </div>
    </li>
  );
}

export function DashboardContent({
  user,
  summary,
}: {
  user: SessionUser;
  summary: DashboardSummary | null;
}) {
  const firstName =
    user.name?.split(/\s+/)[0] ?? user.email.split("@")[0] ?? "there";

  const calls = summary?.calls;
  const recent = summary?.recent_calls ?? [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">
            {greeting()}, {firstName}
          </h1>
          <p className="page-sub">
            Here&apos;s what&apos;s happening across your agents.
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={Bot}
          label="Total agents"
          value={stat(summary?.agents.total)}
          note={
            !summary
              ? "Couldn't load right now"
              : summary.agents.total === 0
                ? "None created yet"
                : `${summary.agents.ready} live on Vapi`
          }
        />
        <StatCard
          icon={PhoneCall}
          label="Total calls"
          value={stat(calls?.total)}
          note={
            !calls
              ? "Couldn't load right now"
              : calls.in_progress > 0
                ? `${calls.in_progress} in progress`
                : calls.total === 0
                  ? "No calls yet"
                  : `${calls.this_month} this month`
          }
        />
        <StatCard
          icon={Clock}
          label="Total minutes"
          value={summary ? summary.minutes.total.toLocaleString() : "—"}
          note={
            !summary
              ? "Couldn't load right now"
              : summary.minutes.total > 0
                ? `${summary.minutes.this_month} this month`
                : "No call time logged"
          }
        />
        <StatCard
          icon={MessagesSquare}
          label="Chat sessions"
          value={stat(summary?.chats.total)}
          note={
            !summary
              ? "Couldn't load right now"
              : summary.chats.total === 0
                ? "No chats yet"
                : `${summary.chats.this_month} this month`
          }
        />
        <StatCard
          icon={Users}
          label="Unique callers"
          value={stat(summary?.unique_callers)}
          note={
            !summary
              ? "Couldn't load right now"
              : summary.avg_duration_seconds > 0
                ? `${duration(summary.avg_duration_seconds)} average call`
                : "No callers yet"
          }
        />
      </div>

      {/* Recent calls */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold tracking-[-0.02em]">Recent calls</h2>
          {calls && calls.failed > 0 && (
            <StatusPill tone="danger">{calls.failed} failed</StatusPill>
          )}
        </div>
        <Card className="[--card-spacing:0px]">
          <CardContent className="p-0">
            {recent.length > 0 ? (
              <ul>
                {recent.map((call) => (
                  <CallRow key={call.id} call={call} />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={PhoneIncoming}
                title={summary ? "No calls yet" : "Couldn't load your calls"}
                body={
                  summary
                    ? "Attach a phone number to an agent, or start a web test call — every call is logged here with its duration and transcript."
                    : "We couldn't reach the server. Refresh to try again."
                }
              />
            )}
          </CardContent>
        </Card>
      </section>

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
