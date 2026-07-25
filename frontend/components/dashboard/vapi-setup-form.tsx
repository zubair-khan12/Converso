"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, CheckCircle2, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectVapi, disconnectVapi } from "@/lib/api";
import type { VapiStatus } from "@/lib/types";

export function VapiSetupForm({ initialStatus }: { initialStatus: VapiStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onConnect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await connectVapi(apiKey);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setApiKey("");
    setStatus(result.status);
    router.refresh();
  }

  async function onDisconnect() {
    setError(null);
    setLoading(true);

    const result = await disconnectVapi();
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStatus(result.status);
    router.refresh();
  }

  if (status.connected) {
    return (
      <Card className="w-full [--card-spacing:1.75rem]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle2 className="h-5 w-5 text-[var(--olive)]" />
            Vapi connected
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-[var(--ink-muted)]">
            Connected using{" "}
            <span className="font-mono text-[var(--ink)]">{status.masked_key}</span>
          </p>

          {error && (
            <p role="alert" className="rounded-lg border border-red-600/20 bg-red-600/8 px-3 py-2.5 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              render={<Link href="/dashboard/agents" />}
              className="gap-1.5 bg-gradient-to-br from-[var(--yellow)] to-[var(--amber)] px-4 text-[var(--ink)] hover:opacity-95"
            >
              Create agent
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={onDisconnect} disabled={loading}>
              {loading ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full [--card-spacing:1.75rem]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRound className="h-5 w-5 text-[var(--amber-ink)]" />
          Connect your Vapi account
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-[var(--ink-muted)]">
          Paste your Vapi private API key below. It's encrypted at rest.
        </p>

        <form className="flex flex-col gap-5" onSubmit={onConnect} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="vapi-key">Vapi private API key</Label>
            <Input
              id="vapi-key"
              type="password"
              autoComplete="off"
              placeholder="sk_live_…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
              autoFocus
              className="h-9"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-red-600/20 bg-red-600/8 px-3 py-2.5 text-sm text-red-700">
              {error}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={loading}
            className="w-full gap-1.5 bg-gradient-to-br from-[var(--yellow)] to-[var(--amber)] text-[var(--ink)] hover:opacity-95"
          >
            {loading ? "Connecting…" : "Connect Vapi"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
