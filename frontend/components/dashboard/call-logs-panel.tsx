"use client";

import { useState } from "react";
import {
  ChevronDown,
  Globe,
  PhoneIncoming,
  PhoneOutgoing,
  Wrench,
} from "lucide-react";

import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { fetchCallDetail } from "@/lib/api";
import type { CallLog, CallLogDetail } from "@/lib/types";

const STATUS_TONE: Record<CallLog["status"], PillTone> = {
  completed: "success",
  active: "pending",
  failed: "danger",
};

const STATUS_LABEL: Record<CallLog["status"], string> = {
  completed: "Completed",
  active: "In progress",
  failed: "Failed",
};

const DIRECTION_ICON = {
  inbound: PhoneIncoming,
  outbound: PhoneOutgoing,
  web: Globe,
} as const;

function duration(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

function when(iso: string | null): string {
  if (!iso) return "Never started";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Vapi's ended reasons are kebab-case machine strings ("customer-ended-call").
 *  Shown as-is they read like an error even when the call went fine, so only
 *  failures surface one, spelled out. */
function endedReason(raw: string | null): string | null {
  if (!raw) return null;
  const words = raw.replace(/[-_]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function who(call: CallLog): string {
  if (call.caller_number) return call.caller_number;
  return call.direction === "web" ? "Web test call" : "Unknown caller";
}

function Detail({ call }: { call: CallLogDetail }) {
  const turns = call.messages.filter(
    (m) => m.role !== "system" && (m.content ?? "").trim(),
  );

  return (
    <div className="space-y-4 border-t border-[var(--border)] bg-[var(--surface-sunk)] px-5 py-4">
      {call.summary && (
        <div>
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--ink-subtle)]">
            Summary
          </p>
          <p className="mt-1 text-sm text-[var(--ink)]">{call.summary}</p>
        </div>
      )}

      <div>
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--ink-subtle)]">
          Transcript
        </p>
        {turns.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {turns.map((turn) => (
              <li key={turn.seq} className="text-sm">
                <span className="font-semibold text-[var(--ink-muted)]">
                  {turn.role === "assistant" ? "Agent" : "Caller"}:
                </span>{" "}
                <span className="text-[var(--ink)]">{turn.content}</span>
              </li>
            ))}
          </ul>
        ) : call.transcript ? (
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-[family-name:inherit] text-sm text-[var(--ink)]">
            {call.transcript}
          </pre>
        ) : (
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            No transcript — the call ended before anything was said, or it
            started before call logging was switched on.
          </p>
        )}
      </div>

      {call.tool_executions.length > 0 && (
        <div>
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--ink-subtle)]">
            What the agent did
          </p>
          <ul className="mt-2 space-y-1">
            {call.tool_executions.map((tool, i) => (
              <li
                key={i}
                className="flex items-center gap-2 text-sm text-[var(--ink-muted)]"
              >
                <Wrench className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[var(--ink)]">{tool.tool_name}</span>
                {tool.latency_ms !== null && (
                  <span className="tabular-nums">{tool.latency_ms}ms</span>
                )}
                {tool.status !== "success" && (
                  <StatusPill tone="danger">{tool.status}</StatusPill>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CallRow({ call }: { call: CallLog }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<CallLogDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const DirectionIcon = DIRECTION_ICON[call.direction];

  async function toggle() {
    const next = !open;
    setOpen(next);
    // Fetch once, the first time it's opened — a transcript per row would make
    // the list itself slow to load.
    if (next && !detail && !loading) {
      setLoading(true);
      setError(null);
      const result = await fetchCallDetail(call.id);
      if (result.ok) setDetail(result.call);
      else setError(result.error);
      setLoading(false);
    }
  }

  const reason = call.status === "failed" ? endedReason(call.ended_reason) : null;

  return (
    <li className="border-t border-[var(--border)] first:border-t-0">
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius)] bg-[var(--accent-soft)] text-[var(--amber-ink)]">
            <DirectionIcon className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate font-semibold text-[var(--ink)]">
                {who(call)}
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[var(--ink-subtle)] transition-transform ${
                  open ? "rotate-180" : ""
                }`}
              />
            </span>
            <span className="block truncate text-xs text-[var(--ink-muted)]">
              {call.agent_name ?? "Deleted agent"} · {when(call.started_at)}
              {reason && ` · ${reason}`}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-3 pl-12 sm:pl-0">
          {call.recording_url ? (
            // Vapi hosts the recording; the URL is what its end-of-call report
            // handed us, so playback is a plain <audio> with no proxying.
            <audio
              controls
              preload="none"
              src={call.recording_url}
              className="h-8 w-56 max-w-full"
            >
              <a href={call.recording_url}>Download the recording</a>
            </audio>
          ) : (
            <span className="text-xs text-[var(--ink-muted)]">No recording</span>
          )}
          <span className="w-14 text-right text-sm tabular-nums text-[var(--ink-muted)]">
            {duration(call.duration_seconds)}
          </span>
          <StatusPill tone={STATUS_TONE[call.status]}>
            {STATUS_LABEL[call.status]}
          </StatusPill>
        </div>
      </div>

      {open && (
        <>
          {loading && (
            <p className="border-t border-[var(--border)] bg-[var(--surface-sunk)] px-5 py-4 text-sm text-[var(--ink-muted)]">
              Loading the transcript…
            </p>
          )}
          {error && (
            <p className="border-t border-[var(--border)] bg-[var(--surface-sunk)] px-5 py-4 text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
          {detail && <Detail call={detail} />}
        </>
      )}
    </li>
  );
}

export function CallLogsPanel({
  calls,
  total,
  hasMore,
}: {
  calls: CallLog[];
  total: number;
  hasMore: boolean;
}) {
  if (calls.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={PhoneIncoming}
            title="No calls yet"
            body="Attach a phone number to an agent, or start a web test call from the Agents screen — every call is logged here with its recording and transcript."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="[--card-spacing:0px]">
        <CardContent className="p-0">
          <ul>
            {calls.map((call) => (
              <CallRow key={call.id} call={call} />
            ))}
          </ul>
        </CardContent>
      </Card>
      {hasMore && (
        <p className="text-xs text-[var(--ink-muted)]">
          Showing the {calls.length} most recent of {total} calls.
        </p>
      )}
    </div>
  );
}
