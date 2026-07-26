"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BookOpen,
  Bot,
  Lock,
  MessagesSquare,
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
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { deleteAgent, retryAgent } from "@/lib/api";
import type { Agent, ProvisioningStatus } from "@/lib/types";

const STATUS_STYLES: Record<ProvisioningStatus, string> = {
  ready: "bg-[rgba(107,142,35,0.14)] text-[#4b6115]",
  pending: "bg-[rgba(233,162,59,0.16)] text-[var(--amber-ink)]",
  failed: "bg-red-600/10 text-red-700",
};

const STATUS_LABELS: Record<ProvisioningStatus, string> = {
  ready: "Live on Vapi",
  pending: "Provisioning…",
  failed: "Sync failed",
};

function StatusPill({ status }: { status: ProvisioningStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </span>
  );
}

function AgentRow({ agent, onTest }: { agent: Agent; onTest: (a: Agent) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"delete" | "retry" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const testable = agent.provisioning_status === "ready";

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

  // Clicking the row opens the test call (for ready agents). Action buttons
  // stop propagation so they don't also start a call.
  return (
    <div
      role={testable ? "button" : undefined}
      tabIndex={testable ? 0 : undefined}
      onClick={testable ? () => onTest(agent) : undefined}
      onKeyDown={
        testable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onTest(agent);
              }
            }
          : undefined
      }
      title={testable ? "Click to test this agent by web" : undefined}
      className={`flex flex-col gap-3 rounded-xl border border-[var(--border)] p-4 transition-colors sm:flex-row sm:items-center sm:justify-between ${
        testable
          ? "cursor-pointer hover:border-[var(--amber)] hover:bg-[rgba(244,201,93,0.06)]"
          : ""
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[rgba(244,201,93,0.22)] text-[var(--amber-ink)]">
          <Bot className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-[var(--ink)]">{agent.name}</p>
            <StatusPill status={agent.provisioning_status} />
            {agent.knowledge_trained && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(107,142,35,0.14)] px-2 py-0.5 text-xs font-semibold text-[#4b6115]">
                <Sparkles className="h-3 w-3" />
                Knowledge
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
            Voice: {agent.voice_id ?? "—"} · Temp: {agent.temperature ?? "—"}
          </p>
          {agent.provisioning_status === "failed" && agent.provisioning_error && (
            <p className="mt-1 text-xs text-red-700">{agent.provisioning_error}</p>
          )}
          {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
        </div>
      </div>

      <div
        className="flex shrink-0 items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {testable && (
          <Button
            size="sm"
            onClick={() => onTest(agent)}
            className="gap-1.5 bg-gradient-to-br from-[var(--yellow)] to-[var(--amber)] text-[var(--ink)] hover:opacity-95"
          >
            <Phone className="h-3.5 w-3.5" />
            Test
          </Button>
        )}
        {agent.provisioning_status === "failed" && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            disabled={busy !== null}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy === "retry" ? "animate-spin" : ""}`} />
            Retry
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          render={<Link href={`/dashboard/knowledge?agent=${agent.id}`} />}
          nativeButton={false}
          className="gap-1.5"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Knowledge
        </Button>
        <Button
          size="sm"
          variant="outline"
          render={<Link href={`/dashboard/agents/${agent.id}`} />}
          nativeButton={false}
          className="gap-1.5"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onDelete}
          disabled={busy !== null}
          className="gap-1.5 text-red-700 hover:bg-red-600/10 hover:text-red-700"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {busy === "delete" ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </div>
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
    <section className="space-y-4">
      <div
        role="tablist"
        aria-label="Agent type"
        className="grid w-full grid-cols-2 gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-sunk)] p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected
          className="flex items-center justify-center gap-2 rounded-lg bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold text-[var(--ink)] shadow-[var(--shadow-sm)] transition-colors"
        >
          <Radio className="h-4 w-4 text-[var(--amber-ink)]" />
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
            className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-[var(--ink-muted)] opacity-70 transition-opacity group-hover:opacity-100"
          >
            <MessagesSquare className="h-4 w-4" />
            Chat agents
            <Lock className="h-3.5 w-3.5" />
          </button>

          <span
            id="chat-agents-soon"
            role="tooltip"
            className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 flex -translate-x-1/2 translate-y-1 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[var(--ink)] px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-[var(--shadow-md)] transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
          >
            <Lock className="h-3 w-3" />
            Launching soon
            <span
              aria-hidden
              className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 rounded-[1px] bg-[var(--ink)]"
            />
          </span>
        </div>
      </div>

      <Card role="tabpanel" aria-label="Voice agents">
        <CardHeader>
          <CardTitle className="text-base">My agents</CardTitle>
          <CardAction className="self-center">
            <Button
              size="lg"
              render={<Link href="/dashboard/agents/new" />}
              nativeButton={false}
              className="gap-1.5 bg-gradient-to-br from-[var(--yellow)] to-[var(--amber)] px-3.5 text-[var(--ink)] hover:opacity-95"
            >
              <Plus className="h-4 w-4" />
              New agent
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="No agents to show yet"
              body="Create a voice agent, give it a personality, and it'll be provisioned on Vapi automatically."
              action={
                <Button
                  variant="outline"
                  render={<Link href="/dashboard/agents/new" />}
                  nativeButton={false}
                  className="gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  Create your first agent
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {agents.map((agent) => (
                <AgentRow key={agent.id} agent={agent} onTest={setCallAgent} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {callAgent && (
        <CallOverlay agent={callAgent} onClose={() => setCallAgent(null)} />
      )}
    </section>
  );
}
