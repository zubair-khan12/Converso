"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BookOpen,
  Bot,
  Gauge,
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
import type { Agent, AgentKind, ProvisioningStatus } from "@/lib/types";

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
  const isChat = agent.kind === "chat";
  const testable = agent.provisioning_status === "ready";
  // A chat agent has no Vapi side, so "Live on Vapi" would be a lie; it is
  // simply ready the moment it is saved.
  const status = isChat
    ? { tone: "success" as PillTone, label: "Ready to chat" }
    : STATUS[agent.provisioning_status];

  async function onDelete() {
    const warning = isChat
      ? `Delete "${agent.name}"? Its knowledge base and chat history go too.`
      : `Delete "${agent.name}"? This removes it from Vapi too.`;
    if (!confirm(warning)) return;
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
          {isChat ? (
            <MessagesSquare className="h-5.5 w-5.5" />
          ) : (
            <Bot className="h-5.5 w-5.5" />
          )}
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
        {isChat ? (
          <Meta icon={MessagesSquare} label="Channel" value="Chat" />
        ) : (
          <Meta icon={Mic} label="Voice" value={agent.voice_id ?? "Default"} />
        )}
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
        {isChat ? (
          /* A page of its own rather than a dialog over the list: a chat is a
             sustained back-and-forth, and a modal makes the conversation feel
             disposable while hiding everything behind it. */
          <Button
            variant="brand"
            render={<Link href={`/chat/${agent.id}`} />}
            nativeButton={false}
            className="flex-1"
          >
            <MessagesSquare className="h-4 w-4" />
            Open chat
          </Button>
        ) : testable ? (
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
 * Voice and chat agents are the same underlying agent — same prompt, same
 * knowledge base, same Cal.com booking — so they share one screen and one
 * "New agent" flow, split by a tab rather than by a separate section.
 */
export function AgentsPanel({
  agents,
  vapiConnected,
}: {
  agents: Agent[];
  vapiConnected: boolean;
}) {
  const [tab, setTab] = useState<AgentKind>("voice");
  const [callAgent, setCallAgent] = useState<Agent | null>(null);

  const shown = agents.filter((a) => a.kind === tab);
  // Voice agents live on Vapi; chat agents don't touch it. So the missing-key
  // notice belongs to the voice tab alone, not the whole screen.
  const needsVapi = tab === "voice" && !vapiConnected;
  const counts = {
    voice: agents.filter((a) => a.kind === "voice").length,
    chat: agents.filter((a) => a.kind === "chat").length,
  };

  const TABS: { kind: AgentKind; label: string; icon: typeof Radio }[] = [
    { kind: "voice", label: "Voice agents", icon: Radio },
    { kind: "chat", label: "Chat agents", icon: MessagesSquare },
  ];

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Agent type"
          className="grid w-full grid-cols-2 gap-1 rounded-[calc(var(--radius)*1.2)] border border-[var(--border)] bg-[var(--surface-sunk)] p-1 sm:w-auto sm:min-w-[22rem]"
        >
          {TABS.map(({ kind, label, icon: Icon }) => {
            const selected = tab === kind;
            return (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(kind)}
                className={
                  selected
                    ? "flex items-center justify-center gap-2 rounded-[var(--radius)] bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold text-[var(--ink)] shadow-[var(--shadow-sm)] transition-colors"
                    : "flex items-center justify-center gap-2 rounded-[var(--radius)] px-3.5 py-2 text-sm font-medium text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
                }
              >
                <Icon
                  className={`h-4 w-4 ${selected ? "text-[var(--amber)]" : ""}`}
                />
                {label}
                {counts[kind] > 0 && (
                  <span className="tabular-nums text-xs text-[var(--ink-subtle)]">
                    {counts[kind]}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <Button
          variant="brand"
          render={
            <Link
              href={
                needsVapi
                  ? "/dashboard/vapi-setup"
                  : `/dashboard/agents/new?kind=${tab}`
              }
            />
          }
          nativeButton={false}
          className="w-full sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          {tab === "chat" ? "New chat agent" : "New voice agent"}
        </Button>
      </div>

      {needsVapi && (
        <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-sunk)] px-4 py-3 text-sm text-[var(--ink-muted)]">
          Voice agents run on your own Vapi account.{" "}
          <Link
            href="/dashboard/vapi-setup"
            className="font-semibold text-[var(--amber-ink)] underline underline-offset-2"
          >
            Connect Vapi
          </Link>{" "}
          to create one — chat agents work without it.
        </p>
      )}

      <div role="tabpanel" aria-label={tab === "chat" ? "Chat agents" : "Voice agents"}>
        {shown.length === 0 ? (
          <div className="rounded-[calc(var(--radius)*1.4)] border border-[var(--border)] bg-[var(--surface)]">
            <EmptyState
              icon={tab === "chat" ? MessagesSquare : Bot}
              title={
                tab === "chat" ? "No chat agents yet" : "No voice agents yet"
              }
              body={
                tab === "chat"
                  ? "A chat agent answers in writing from the same knowledge base a voice agent uses, and can book meetings through Cal.com. No Vapi account needed."
                  : "A voice agent answers a real phone number, using the same knowledge base and booking tools as a chat agent. It's provisioned on your Vapi account automatically."
              }
              action={
                <Button
                  variant="outline"
                  render={<Link href={`/dashboard/agents/new?kind=${tab}`} />}
                  nativeButton={false}
                >
                  <Plus className="h-4 w-4" />
                  {tab === "chat" ? "Create a chat agent" : "Create your first agent"}
                </Button>
              }
            />
          </div>
        ) : (
          /* auto-fill with a minimum width rather than fixed column counts:
             the card keeps a readable width at every viewport, including the
             narrower space left when the sidebar is expanded. */
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
            {shown.map((agent) => (
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
