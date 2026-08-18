"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy, Globe, Plus, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rotateWidgetToken, saveWidget } from "@/lib/api";
import type { Agent, WidgetSettings } from "@/lib/types";

/** A snippet plus a button that copies it. The clipboard API needs a secure
 *  context, so the textarea fallback keeps this working on plain http. */
function Snippet({ label, hint, code }: { label: string; hint: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const area = document.createElement("textarea");
      area.value = code;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">{label}</p>
          <p className="text-xs text-[var(--ink-muted)]">{hint}</p>
        </div>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-sunk)] p-3 text-xs leading-relaxed text-[var(--ink)]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * Embed settings for one agent. The websites list isn't decoration: the widget
 * runs on our OpenAI key, so an agent can only go live once its owner has said
 * where it's allowed to appear.
 */
export function WidgetPanel({ agent }: { agent: Agent }) {
  const router = useRouter();
  const [widget, setWidget] = useState<WidgetSettings>(agent.widget);
  const [origins, setOrigins] = useState<string[]>(agent.widget.allowed_origins);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appUrl = typeof window === "undefined" ? "" : window.location.origin;
  const token = widget.public_token ?? "YOUR_TOKEN";

  async function persist(next: { enabled: boolean; allowed_origins: string[] }) {
    setError(null);
    setBusy(true);
    const result = await saveWidget(agent.id, next);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setWidget(result.widget);
    setOrigins(result.widget.allowed_origins);
    router.refresh();
  }

  function addOrigin() {
    const value = draft.trim();
    if (!value) return;
    const next = [...origins, value];
    setDraft("");
    void persist({ enabled: widget.enabled, allowed_origins: next });
  }

  function removeOrigin(origin: string) {
    const next = origins.filter((o) => o !== origin);
    // Removing the last website would leave the widget live with nothing
    // allowed, which the API refuses — so it switches off with it.
    void persist({ enabled: next.length > 0 && widget.enabled, allowed_origins: next });
  }

  async function rotate() {
    if (
      !confirm(
        "Issue a new token? The snippet already on your website will stop working until you paste the new one.",
      )
    )
      return;
    setError(null);
    setBusy(true);
    const result = await rotateWidgetToken(agent.id);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setWidget(result.widget);
  }

  const scriptSnippet = `<script src="${appUrl}/widget.js" data-agent="${token}"></script>`;
  // The bare iframe can't report where it's embedded the way the script can
  // (that one reads location.origin at runtime), so the site is baked into the
  // URL. Without it the only signal is the Referer header, and a site that
  // strips it — or sandboxes the frame — could never load the widget at all.
  const site = origins[0] ?? "";
  const iframeSnippet = `<iframe\n  src="${appUrl}/widget/${token}?o=${encodeURIComponent(site)}"\n  title="${agent.name}"\n  allow="microphone"\n  style="width:100%;max-width:420px;height:560px;border:0;border-radius:16px"\n></iframe>`;

  return (
    <Card className="[--card-spacing:1.5rem]">
      <CardHeader className="flex flex-col items-start justify-between gap-3 space-y-0 sm:flex-row sm:items-center">
        <div>
          <CardTitle>Website widget</CardTitle>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {agent.kind === "chat"
              ? "Put this agent on your own site as a chat bubble."
              : "Let visitors call this agent from your site, with no phone number."}
          </p>
        </div>
        <Button
          variant={widget.enabled ? "outline" : "brand"}
          disabled={busy || (!widget.enabled && origins.length === 0)}
          onClick={() =>
            void persist({ enabled: !widget.enabled, allowed_origins: origins })
          }
        >
          {widget.enabled ? "Turn off" : "Turn on"}
        </Button>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="origin">Allowed websites</Label>
          <p className="text-xs text-[var(--ink-muted)]">
            The widget only loads on these. Anywhere else is refused, so a copied
            snippet can&apos;t run the agent on someone else&apos;s site at your
            expense.
          </p>
          <div className="flex gap-2">
            <Input
              id="origin"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOrigin();
                }
              }}
              placeholder="https://yourcompany.com"
              disabled={busy}
            />
            <Button variant="outline" onClick={addOrigin} disabled={busy || !draft.trim()}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>

          {origins.length > 0 && (
            <ul className="flex flex-wrap gap-2 pt-1">
              {origins.map((origin) => (
                <li
                  key={origin}
                  className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-sunk)] py-1 pl-3 pr-1.5 text-sm"
                >
                  <Globe className="h-3.5 w-3.5 text-[var(--ink-subtle)]" />
                  {origin}
                  <button
                    type="button"
                    onClick={() => removeOrigin(origin)}
                    disabled={busy}
                    aria-label={`Remove ${origin}`}
                    className="grid h-5 w-5 place-items-center rounded-full text-[var(--ink-subtle)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-[var(--radius)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]"
          >
            {error}
          </p>
        )}

        {widget.enabled && widget.public_token ? (
          <div className="space-y-4 border-t border-[var(--border)] pt-5">
            <Snippet
              label="Floating bubble"
              hint="Paste before </body>. Adds a button in the corner of every page."
              code={scriptSnippet}
            />
            <Snippet
              label="Inline on a page"
              hint={
                origins.length > 1
                  ? `Drop into a section to embed it in the page itself. Built for ${site} — change the o= value for your other sites.`
                  : "Drop into a section to embed it in the page itself."
              }
              code={iframeSnippet}
            />
            <Button variant="outline" size="sm" onClick={rotate} disabled={busy}>
              <RefreshCw className="h-4 w-4" />
              Issue a new token
            </Button>
          </div>
        ) : (
          <p className="border-t border-[var(--border)] pt-5 text-sm text-[var(--ink-muted)]">
            {origins.length === 0
              ? "Add the website you'll embed this on, then turn the widget on to get your snippet."
              : "Turn the widget on to get your embed snippet."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
