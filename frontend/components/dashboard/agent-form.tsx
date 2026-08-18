"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createAgent, updateAgent } from "@/lib/api";
import type { Agent, AgentKind, Voice } from "@/lib/types";

// Seeded into a new agent's base prompt so it's already oriented toward
// answering from a knowledge base (the tenant can edit or replace it). The two
// differ in more than a word: a phone reply has to be short and speakable,
// while a chat reply can use a list and is read, not heard.
const DEFAULT_BASE_PROMPT: Record<AgentKind, string> = {
  voice:
    "You are a friendly, concise voice assistant for this business. Answer the " +
    "caller's questions using the business's knowledge base. If something isn't " +
    "covered there, say so honestly instead of guessing, and offer to help " +
    "another way. Keep replies short and natural for a phone conversation.",
  chat:
    "You are a friendly, helpful chat assistant for this business. Answer the " +
    "visitor's questions using the business's knowledge base. If something isn't " +
    "covered there, say so honestly instead of guessing, and offer to help " +
    "another way. Keep replies short and easy to skim; use a short list when " +
    "you are giving several options.",
};

export function AgentForm({
  voices,
  agent,
  kind = "voice",
}: {
  voices: Voice[];
  agent?: Agent;
  /** Which kind to create. Ignored when editing — an existing agent's own
   *  kind wins, since transport can't be switched after creation. */
  kind?: AgentKind;
}) {
  const router = useRouter();
  const isEdit = Boolean(agent);
  const agentKind = agent?.kind ?? kind;
  const isChat = agentKind === "chat";

  const [name, setName] = useState(agent?.name ?? "");
  const [voiceId, setVoiceId] = useState(
    agent?.voice_id ?? voices[0]?.voiceId ?? "",
  );
  const [temperature, setTemperature] = useState(agent?.temperature ?? 0.7);
  const [firstMessage, setFirstMessage] = useState(agent?.first_message ?? "");
  const [basePrompt, setBasePrompt] = useState(
    agent?.base_prompt ?? DEFAULT_BASE_PROMPT[agentKind],
  );
  const [error, setError] = useState<string | null>(null);
  // Which button is in flight, so each shows its own busy label.
  const [saving, setSaving] = useState<"agents" | "knowledge" | null>(null);

  // Save the agent, then go to `dest`: back to the list, or straight into this
  // agent's Knowledge Base tab (the "Add knowledge base" path — the agent must
  // exist before it can own documents).
  async function save(dest: "agents" | "knowledge") {
    if (saving) return;
    setError(null);
    setSaving(dest);

    const input = {
      name,
      kind: agentKind,
      base_prompt: basePrompt,
      voice_id: voiceId,
      temperature,
      first_message: firstMessage,
    };
    const result = isEdit
      ? await updateAgent(agent!.id, input)
      : await createAgent(input);

    if (!result.ok) {
      setError(result.error);
      setSaving(null);
      return;
    }

    const id = isEdit ? agent!.id : result.agent.id;
    // A Vapi failure still saves the agent locally as "failed"; the list shows
    // that state with a retry, so either way we move on.
    router.push(
      dest === "knowledge" ? `/dashboard/knowledge?agent=${id}` : "/dashboard/agents",
    );
    router.refresh();
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void save("agents");
  }

  return (
    <Card className="w-full [--card-spacing:1.75rem]">
      <CardContent>
        <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Agent name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Front Desk"
              required
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="first-message">First message</Label>
            <Textarea
              id="first-message"
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
              placeholder={
                isChat
                  ? "e.g. Hi! Ask me anything about Acme."
                  : "e.g. Hi, thanks for calling Acme! How can I help you today?"
              }
              rows={2}
            />
            <p className="text-xs text-[var(--ink-muted)]">
              {isChat
                ? "Shown as the agent's opening line. Leave blank to let the visitor speak first."
                : "The agent says this the moment the call connects. Leave blank to have it wait for the caller to speak first."}
            </p>
          </div>

          {!isChat && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="voice">Voice</Label>
            <NativeSelect
              id="voice"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
            >
              {voices.map((v) => (
                <option key={v.voiceId} value={v.voiceId}>
                  {v.name} — {v.gender}, {v.accent}
                </option>
              ))}
            </NativeSelect>
          </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="temperature">Temperature</Label>
              <span className="text-sm tabular-nums text-[var(--ink-muted)]">
                {temperature.toFixed(2)}
              </span>
            </div>
            <input
              id="temperature"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full accent-[var(--amber)]"
            />
            <p className="text-xs text-[var(--ink-muted)]">
              Lower is more focused and consistent; higher is more creative.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="prompt">Base prompt</Label>
            <Textarea
              id="prompt"
              value={basePrompt}
              onChange={(e) => setBasePrompt(e.target.value)}
              placeholder="Describe who the agent is, how it should greet callers, and what it should help with…"
              rows={8}
              required
            />
            <p className="text-xs text-[var(--ink-muted)]">
              This becomes the agent&apos;s system prompt on every
              {isChat ? " conversation." : " call."}
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-sm text-[var(--danger)]"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              size="lg"
              variant="brand"
              disabled={saving !== null}
            >
              {saving === "agents"
                ? isEdit
                  ? "Saving…"
                  : "Creating…"
                : isEdit
                  ? "Save changes"
                  : "Create agent"}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={saving !== null}
              onClick={() => void save("knowledge")}
            >
              <BookOpen className="h-4 w-4" />
              {saving === "knowledge" ? "Saving…" : "Add knowledge base"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              render={<Link href="/dashboard/agents" />}
              nativeButton={false}
            >
              <ArrowLeft className="h-4 w-4" />
              Cancel
            </Button>
          </div>
          <p className="-mt-1 text-xs text-[var(--ink-muted)]">
            The agent is created first; “Add knowledge base” then opens its
            Knowledge Base so you can add text or documents and train it.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
