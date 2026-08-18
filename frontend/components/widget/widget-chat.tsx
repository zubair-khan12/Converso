"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

import type { WidgetConfig } from "@/lib/types";

type Turn = { role: "user" | "assistant"; content: string };

/**
 * The public chat widget. Shares nothing with the dashboard's ChatPanel on
 * purpose: this one shows no trace, no sources and no latency — that's internal
 * detail about the tenant's knowledge base, and it renders on their customers'
 * screens. It also talks to the public endpoint, which takes no session.
 */
export function WidgetChat({
  config,
  token,
  origin,
}: {
  config: WidgetConfig;
  token: string;
  origin: string;
}) {
  const greeting = config.first_message.trim();
  const [turns, setTurns] = useState<Turn[]>(
    greeting ? [{ role: "assistant", content: greeting }] : [],
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionId = useRef<string | undefined>(undefined);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, sending]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;

    setDraft("");
    setError(null);
    setTurns((prev) => [...prev, { role: "user", content: message }]);
    setSending(true);

    let data: { session_id?: string; answer?: string; error?: string } = {};
    try {
      const res = await fetch(`/api/widget/${token}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Widget-Origin": origin },
        body: JSON.stringify({ message, session_id: sessionId.current }),
      });
      data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "");
    } catch (err) {
      setSending(false);
      // The backend's own wording (rate limited, daily cap, not allowed here)
      // is more useful than anything generic we could substitute.
      setError(
        (err as Error).message ||
          "Sorry, something went wrong. Please try again.",
      );
      return;
    }

    setSending(false);
    sessionId.current = data.session_id;
    setTurns((prev) => [
      ...prev,
      { role: "assistant", content: data.answer ?? "" },
    ]);
  }

  return (
    <div className="flex h-dvh flex-col bg-[var(--surface)]">
      <header className="border-b border-[var(--border)] px-4 py-3">
        <p className="font-[family-name:var(--font-display)] text-sm font-bold">
          {config.name}
        </p>
        <p className="text-xs text-[var(--ink-muted)]">Ask us anything</p>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {turns.map((turn, i) => (
          <div
            key={i}
            className={turn.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                turn.role === "user"
                  ? "max-w-[85%] rounded-[calc(var(--radius)*1.2)] rounded-br-sm bg-[var(--navy)] px-3.5 py-2 text-sm text-white"
                  : "max-w-[85%] rounded-[calc(var(--radius)*1.2)] rounded-bl-sm border border-[var(--border)] bg-[var(--surface-sunk)] px-3.5 py-2 text-sm text-[var(--ink)]"
              }
            >
              <p className="whitespace-pre-wrap">{turn.content}</p>
            </div>
          </div>
        ))}

        {sending && (
          <p className="text-xs text-[var(--ink-muted)]" aria-live="polite">
            Typing…
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-[var(--danger)]">
            {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-[var(--border)] p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          aria-label="Message"
          maxLength={2000}
          className="h-10 flex-1 rounded-[var(--radius)] border border-[var(--border)] px-3 text-sm outline-none focus-visible:border-[var(--amber)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          aria-label="Send"
          className="grid h-10 w-10 place-items-center rounded-[var(--radius)] bg-[var(--navy)] text-white disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
