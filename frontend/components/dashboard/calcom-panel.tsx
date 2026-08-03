"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarClock, Check, Copy, ExternalLink, Unplug } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { connectCalcom, disconnectCalcom, selectCalcomEvent } from "@/lib/api";
import type { Agent, CalcomStatus } from "@/lib/types";

const API_KEYS_URL = "https://app.cal.com/settings/developer/api-keys";

/** The three things that must be true before an agent can book, in order. Each
 *  one is either done or is the next thing to do — so the panel always shows
 *  the user exactly where they are. */
function Step({
  index,
  title,
  done,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span
        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
          done
            ? "bg-[var(--success-soft)] text-[var(--success-ink)]"
            : "bg-[var(--surface-sunk)] text-[var(--ink-muted)]"
        }`}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : index}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

function ConnectForm({ onConnected }: { onConnected: (status: CalcomStatus) => void }) {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await connectCalcom(apiKey);
    setLoading(false);
    if (!result.ok) return setError(result.error);
    setApiKey("");
    onConnected(result.status);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <Label htmlFor="calcom-key" className="sr-only">
        Cal.com API key
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="calcom-key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="cal_live_…"
          autoComplete="off"
          spellCheck={false}
          disabled={loading}
        />
        <Button type="submit" disabled={loading || !apiKey.trim()}>
          {loading ? "Checking…" : "Connect"}
        </Button>
      </div>
      <p className="text-xs text-[var(--ink-muted)]">
        Create one under{" "}
        <a
          href={API_KEYS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
        >
          Cal.com → Settings → Developer → API keys
          <ExternalLink className="h-3 w-3" />
        </a>
        . We check it against Cal.com before saving, then store it encrypted.
      </p>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
    </form>
  );
}

function PromptBox({ prompt, agentName }: { prompt: string; agentName: string | null }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-2">
      <Textarea
        readOnly
        value={prompt}
        rows={12}
        onFocus={(e) => e.currentTarget.select()}
        className="bg-[var(--surface-sunk)] font-mono text-xs"
        aria-label="Scheduling instructions to paste into your agent's base prompt"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={onCopy} className="gap-1.5">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy prompt"}
        </Button>
        <p className="text-xs text-[var(--ink-muted)]">
          Paste it at the end of {agentName ? `${agentName}'s` : "the agent's"} base prompt under
          Agents, then save.
        </p>
      </div>
    </div>
  );
}

export function CalcomPanel({
  status: initialStatus,
  agents,
}: {
  status: CalcomStatus;
  agents: Agent[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  // Both halves of the link are submitted together, so hold the un-saved half
  // locally until its partner is chosen.
  const [eventId, setEventId] = useState(initialStatus.event_type_id?.toString() ?? "");
  const [agentId, setAgentId] = useState(initialStatus.agent_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // An agent has to exist on Vapi before it can be given tools.
  const linkableAgents = agents.filter((a) => a.provisioning_status === "ready");

  function applyStatus(next: CalcomStatus) {
    setStatus(next);
    setEventId(next.event_type_id?.toString() ?? "");
    setAgentId(next.agent_id ?? "");
    // Server components (the nav, the agents list) read this too.
    router.refresh();
  }

  async function link(nextEventId: string, nextAgentId: string) {
    setEventId(nextEventId);
    setAgentId(nextAgentId);
    if (!nextEventId || !nextAgentId) return; // wait for the other half
    setError(null);
    setBusy(true);
    const result = await selectCalcomEvent(Number(nextEventId), nextAgentId);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    applyStatus(result.status);
  }

  async function onDisconnect() {
    if (!confirm("Disconnect Cal.com? Your agents will stop being able to book meetings.")) return;
    setError(null);
    setBusy(true);
    const result = await disconnectCalcom();
    setBusy(false);
    if (!result.ok) return setError(result.error);
    applyStatus(result.status);
  }

  // Scheduling is only actually armed when an event *and* an agent are saved.
  const linked = status.connected && status.event_type_id !== null && status.agent_id !== null;

  return (
    <Card className="max-w-4xl [--card-spacing:1.5rem]">
      <CardHeader className="flex flex-col items-start justify-between gap-4 space-y-0 sm:flex-row">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--amber-ink)]">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <CardTitle>Cal.com scheduling</CardTitle>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              {linked
                ? `${status.agent_name} can book "${status.event_title}" meetings on the phone.`
                : "Let one agent check your calendar and book meetings during a call."}
            </p>
          </div>
        </div>
        {status.connected && (
          <Button
            size="sm"
            variant="outline"
            onClick={onDisconnect}
            disabled={busy}
            className="shrink-0 gap-1.5 text-[var(--danger)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
          >
            <Unplug className="h-3.5 w-3.5" />
            Disconnect
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        <Step index={1} title="Connect your Cal.com account" done={status.connected}>
          {status.connected ? (
            <p className="text-sm text-[var(--ink-muted)]">
              Connected as{" "}
              <span className="font-medium text-[var(--ink)]">{status.organizer_email}</span> · key{" "}
              <span className="font-mono text-xs">{status.masked_key}</span> · times spoken in{" "}
              <span className="font-medium text-[var(--ink)]">{status.time_zone}</span>
            </p>
          ) : (
            <ConnectForm onConnected={applyStatus} />
          )}
        </Step>

        <Step index={2} title="Choose which agent books which meeting" done={linked}>
          {!status.connected ? (
            <p className="text-sm text-[var(--ink-muted)]">Connect your account first.</p>
          ) : status.event_types.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">
              No event types on this account yet. Create one on Cal.com, then reload this page.
            </p>
          ) : linkableAgents.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">
              No live agents yet. Create one under Agents first — only an agent that&apos;s live on
              Vapi can be given the booking tools.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="calcom-agent">Booking agent</Label>
                  <NativeSelect
                    id="calcom-agent"
                    value={agentId}
                    onChange={(e) => link(eventId, e.target.value)}
                    disabled={busy}
                  >
                    <option value="">— Pick an agent —</option>
                    {linkableAgents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="calcom-event">Event type</Label>
                  <NativeSelect
                    id="calcom-event"
                    value={eventId}
                    onChange={(e) => link(e.target.value, agentId)}
                    disabled={busy}
                  >
                    <option value="">— Pick an event type —</option>
                    {status.event_types.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title}
                        {e.length_minutes ? ` · ${e.length_minutes} min` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
              <p className="text-xs text-[var(--ink-muted)]">
                Only this agent can book — your other agents are unaffected. The invite goes to
                whatever email the caller gives it on the call.
              </p>
            </div>
          )}
        </Step>

        <Step
          index={3}
          title={
            status.agent_name
              ? `Add the booking instructions to ${status.agent_name}`
              : "Add the booking instructions to your agent"
          }
          done={false}
        >
          {status.scheduling_prompt ? (
            <PromptBox prompt={status.scheduling_prompt} agentName={status.agent_name} />
          ) : (
            <p className="text-sm text-[var(--ink-muted)]">
              Pick an agent and an event type, and the ready-to-paste instructions will appear
              here.
            </p>
          )}
        </Step>

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      </CardContent>
    </Card>
  );
}
