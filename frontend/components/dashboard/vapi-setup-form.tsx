"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, CheckCircle2, KeyRound, Radio } from "lucide-react";

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
  const [publicKey, setPublicKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(input: { api_key?: string; public_key?: string }) {
    setError(null);
    setLoading(true);
    const result = await connectVapi(input);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setStatus(result.status);
    setApiKey("");
    setPublicKey("");
    router.refresh();
    return true;
  }

  async function onConnect(e: React.FormEvent) {
    e.preventDefault();
    await submit({
      api_key: apiKey,
      public_key: publicKey || undefined,
    });
  }

  async function onAddPublicKey(e: React.FormEvent) {
    e.preventDefault();
    await submit({ public_key: publicKey });
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

  const errorBox = error && (
    <p
      role="alert"
      className="rounded-lg border border-red-600/20 bg-red-600/8 px-3 py-2.5 text-sm text-red-700"
    >
      {error}
    </p>
  );

  if (status.connected) {
    return (
      <Card className="w-full [--card-spacing:1.75rem]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle2 className="h-5 w-5 text-[var(--olive)]" />
            Vapi connected
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-[var(--ink-muted)]">
            Connected using{" "}
            <span className="font-mono text-[var(--ink)]">{status.masked_key}</span>
          </p>

          {/* Public key — needed for testing agents by web in the browser. */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-sunk)] p-4">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-[var(--amber-ink)]" />
              <p className="text-sm font-semibold text-[var(--ink)]">
                Web testing key
              </p>
              {status.has_public_key && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(107,142,35,0.14)] px-2 py-0.5 text-xs font-semibold text-[#4b6115]">
                  <CheckCircle2 className="h-3 w-3" />
                  Added
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              Your Vapi <span className="font-medium">public</span> key lets
              you talk to agents in the browser — it&apos;s safe to expose to
              the page.
            </p>

            <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={onAddPublicKey}>
              <Input
                type="text"
                autoComplete="off"
                placeholder={status.has_public_key ? "Replace public key…" : "Public key…"}
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
                className="h-9"
              />
              <Button
                type="submit"
                size="lg"
                variant="outline"
                disabled={loading || !publicKey}
                className="shrink-0"
              >
                {loading ? "Saving…" : status.has_public_key ? "Update" : "Add key"}
              </Button>
            </form>
          </div>

          {errorBox}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              render={<Link href="/dashboard/agents" />}
              nativeButton={false}
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
          Paste your Vapi keys below. They&apos;re encrypted at rest.
        </p>

        <form className="flex flex-col gap-5" onSubmit={onConnect} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="vapi-key">Private API key</Label>
            <Input
              id="vapi-key"
              type="password"
              autoComplete="off"
              placeholder="Private key — used to create agents"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
              autoFocus
              className="h-9"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="vapi-public-key">
              Public key{" "}
              <span className="font-normal text-[var(--ink-muted)]">
                — for testing by web
              </span>
            </Label>
            <Input
              id="vapi-public-key"
              type="text"
              autoComplete="off"
              placeholder="Public key — optional, add now or later"
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              className="h-9"
            />
          </div>

          {errorBox}

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
