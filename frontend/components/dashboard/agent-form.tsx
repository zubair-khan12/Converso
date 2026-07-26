"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAgent, updateAgent } from "@/lib/api";
import type { Agent, Voice } from "@/lib/types";

const fieldClass =
  "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function AgentForm({
  voices,
  agent,
}: {
  voices: Voice[];
  agent?: Agent;
}) {
  const router = useRouter();
  const isEdit = Boolean(agent);

  const [name, setName] = useState(agent?.name ?? "");
  const [voiceId, setVoiceId] = useState(
    agent?.voice_id ?? voices[0]?.voiceId ?? "",
  );
  const [temperature, setTemperature] = useState(agent?.temperature ?? 0.7);
  const [firstMessage, setFirstMessage] = useState(agent?.first_message ?? "");
  const [basePrompt, setBasePrompt] = useState(agent?.base_prompt ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const input = {
      name,
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
      setSaving(false);
      return;
    }

    // A Vapi failure still saves the agent locally as "failed"; the list shows
    // that state with a retry, so either way we head back to it.
    router.push("/dashboard/agents");
    router.refresh();
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
              className="h-9"
              required
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="first-message">First message</Label>
            <textarea
              id="first-message"
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
              placeholder="e.g. Hi, thanks for calling Acme! How can I help you today?"
              rows={2}
              className={`${fieldClass} resize-y leading-relaxed`}
            />
            <p className="text-xs text-[var(--ink-muted)]">
              The agent says this the moment the call connects. Leave blank to
              have it wait for the caller to speak first.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="voice">Voice</Label>
            <select
              id="voice"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              className={`${fieldClass} h-9`}
            >
              {voices.map((v) => (
                <option key={v.voiceId} value={v.voiceId}>
                  {v.name} — {v.gender}, {v.accent}
                </option>
              ))}
            </select>
          </div>

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
            <textarea
              id="prompt"
              value={basePrompt}
              onChange={(e) => setBasePrompt(e.target.value)}
              placeholder="Describe who the agent is, how it should greet callers, and what it should help with…"
              rows={8}
              className={`${fieldClass} resize-y leading-relaxed`}
              required
            />
            <p className="text-xs text-[var(--ink-muted)]">
              This becomes the agent&apos;s system prompt on every call.
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-600/20 bg-red-600/8 px-3 py-2.5 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              size="lg"
              disabled={saving}
              className="gap-1.5 bg-gradient-to-br from-[var(--yellow)] to-[var(--amber)] px-5 text-[var(--ink)] hover:opacity-95"
            >
              {saving
                ? isEdit
                  ? "Saving…"
                  : "Creating…"
                : isEdit
                  ? "Save changes"
                  : "Create agent"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              render={<Link href="/dashboard/agents" />}
              nativeButton={false}
              className="gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" />
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
