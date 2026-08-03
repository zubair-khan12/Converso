"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BookOpen,
  Bot,
  Gauge,
  Lock,
  MessagesSquare,
  Mic,
  Pencil,
  Phone,
  Plus,
  Radio,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";

import { CallOverlay } from "@/components/dashboard/call-overlay";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { deleteAgent, retryAgent } from "@/lib/api";
import type { Agent, ProvisioningStatus } from "@/lib/types";

const STATUS: Record<ProvisioningStatus, { tone: PillTone; label: string }> = {
  ready: { tone: "success", label: "Live on Vapi" },
  pending: { tone: "pending", label: "Provisioning…" },
  failed: { tone: "danger", label: "Sync failed" },
};

/** One labelled fact about the agent. Keeps the card's body on a grid instead
 *  of running voice and temperature together in a single grey sentence. */
function Meta({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mic;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--ink-subtle)]">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium text-[var(--ink)]">{value}</p>
    </div>
  );
}

function AgentCard({ agent, onTest }: { agent: Agent; onTest: (a: Agent) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"delete" | "retry" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const testable = agent.provisioning_status === "ready";
  const status = STATUS[agent.provisioning_status];

  async function onDelete() {
    if (!confirm(`Delete "${agent.name}"? This removes it from Vapi too.`)) return;
    setError(null);
    setBusy("delete");
    const result = await deleteAgent(agent.id);
    if (!result.ok) {
      setError(result.error);
      setBusy(null);
      return;
    }
    router.refresh();
  }

  async function onRetry() {
    setError(null);
    setBusy("retry");
    const result = await retryAgent(agent.id);
    if (!result.ok) {
      setError(result.error);
      setBusy(null);
      return;
    }
    router.refresh();
  }

  return (
    <article className="flex flex-col rounded-[calc(var(--radius)*1.4)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]">
      <div className="flex items-start gap-3 p-5 pb-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius)] bg-[var(--accent-soft)] text-[var(--amber-ink)]">
          <Bot className="h-5.5 w-5.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            title={agent.name}
            className="truncate font-[family-name:var(--font-display)] text-base font-bold tracking-[-0.01em]"
          >
            {agent.name}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            {agent.knowledge_trained && (
              <StatusPill tone="success" dot={false}>
                <Sparkles className="h-3 w-3" />
                Knowledge
              </StatusPill>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-y border-[var(--border)] bg-[var(--surface-sunk)]/60 px-5 py-3.5">
        <Meta icon={Mic} label="Voice" value={agent.voice_id ?? "Default"} />
        <Meta
          icon={Gauge}
          label="Temperature"
          value={agent.temperature != null ? String(agent.temperature) : "—"}
        />
      </div>

      {(error || (agent.provisioning_status === "failed" && agent.provisioning_error)) && (
        <p className="mx-5 mt-4 rounded-[var(--radius)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
          {error ?? agent.provisioning_error}
        </p>
      )}

      {/* Test is the thing you came here to do, so it gets the width and the
          brand fill; everything else is an icon with an accessible name. */}
      <div className="flex items-center gap-2 p-5 pt-4">
        {testable ? (
          <Button variant="brand" onClick={() => onTest(agent)} className="flex-1">
            <Phone className="h-4 w-4" />
            Test call
          </Button>
        ) : agent.provisioning_status === "failed" ? (
          <Button variant="outline" onClick={onRetry} disabled={busy !== null} className="flex-1">
            <RefreshCw className={`h-4 w-4 ${busy === "retry" ? "animate-spin" : ""}`} />
            Retry sync
          </Button>
        ) : (
          <Button variant="outline" disabled className="flex-1">
            Provisioning…
          </Button>
        )}

        <Button
          size="icon"
          variant="outline"
          title="Knowledge base"
          aria-label={`Knowledge base for ${agent.name}`}
          render={<Link href={`/dashboard/knowledge?agent=${agent.id}`} />}
          nativeButton={false}
        >
          <BookOpen className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          title="Edit agent"
          aria-label={`Edit ${agent.name}`}
          render={<Link href={`/dashboard/agents/${agent.id}`} />}
          nativeButton={false}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          onClick={onDelete}
          disabled={busy !== null}
          title="Delete agent"
          aria-label={`Delete ${agent.name}`}
          className="text-[var(--danger)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </article>
  );
}

/**
 * Voice agents are live; chat agents are on the roadmap. The chat tab stays
 * visible so the direction is clear, but it can't be opened — hovering or
 * focusing it explains why.
 */
export function AgentsPanel({ agents }: { agents: Agent[] }) {
  const [callAgent, setCallAgent] = useState<Agent | null>(null);

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Agent type"
          className="grid w-full grid-cols-2 gap-1 rounded-[calc(var(--radius)*1.2)] border border-[var(--border)] bg-[var(--surface-sunk)] p-1 sm:w-auto sm:min-w-[22rem]"
        >
          <button
            type="button"
            role="tab"
            aria-selected
            className="flex items-center justify-center gap-2 rounded-[var(--radius)] bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold text-[var(--ink)] shadow-[var(--shadow-sm)] transition-colors"
          >
            <Radio className="h-4 w-4 text-[var(--amber)]" />
            Voice agents
          </button>

          {/* Locked tab. aria-disabled (not `disabled`) so it stays hoverable,
              focusable, and can announce why it's unavailable. */}
          <div className="group relative">
            <button
              type="button"
              role="tab"
              aria-selected={false}
              aria-disabled
              aria-describedby="chat-agents-soon"
              className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-[var(--radius)] px-3.5 py-2 text-sm font-medium text-[var(--ink-muted)] opacity-70 transition-opacity group-hover:opacity-100"
            >
              <MessagesSquare className="h-4 w-4" />
              Chat agents
              <Lock className="h-3.5 w-3.5" />
            </button>

            <span
              id="chat-agents-soon"
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 flex -translate-x-1/2 translate-y-1 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[var(--navy)] px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-[var(--shadow-md)] transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
            >
              <Lock className="h-3 w-3" />
              Launching soon
              <span
                aria-hidden
                className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 rounded-[1px] bg-[var(--navy)]"
              />
            </span>
          </div>
        </div>

        <Button
          variant="brand"
          render={<Link href="/dashboard/agents/new" />}
          nativeButton={false}
          className="w-full sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          New agent
        </Button>
      </div>

      <div role="tabpanel" aria-label="Voice agents">
        {agents.length === 0 ? (
          <div className="rounded-[calc(var(--radius)*1.4)] border border-[var(--border)] bg-[var(--surface)]">
            <EmptyState
              icon={Bot}
              title="No agents to show yet"
              body="Create a voice agent, give it a personality, and it'll be provisioned on Vapi automatically."
              action={
                <Button
                  variant="outline"
                  render={<Link href="/dashboard/agents/new" />}
                  nativeButton={false}
                >
                  <Plus className="h-4 w-4" />
                  Create your first agent
                </Button>
              }
            />
          </div>
        ) : (
          /* auto-fill with a minimum width rather than fixed column counts:
             the card keeps a readable width at every viewport, including the
             narrower space left when the sidebar is expanded. */
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onTest={setCallAgent} />
            ))}
          </div>
        )}
      </div>

      {callAgent && (
        <CallOverlay agent={callAgent} onClose={() => setCallAgent(null)} />
      )}
    </section>
  );
}
