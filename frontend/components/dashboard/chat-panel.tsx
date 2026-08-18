"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CalendarCheck,
  MessagesSquare,
  RotateCcw,
  Send,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { sendChatMessage } from "@/lib/api";
import type { Agent, ChatTrace } from "@/lib/types";

type Turn = {
  role: "user" | "assistant";
  content: string;
  trace?: ChatTrace;
};

const TOOL_LABELS: Record<string, string> = {
  calcom_find_slots: "Checked the calendar",
  calcom_book_meeting: "Booked a meeting",
};

/** The trace under a reply, so it's visible *why* an answer looked the way it
 *  did — which documents were retrieved, which booking calls ran. The same
 *  information the backend console prints and the call log stores. */
function TraceLine({ trace }: { trace: ChatTrace }) {
  const bits: { icon: typeof BookOpen; text: string }[] = [];

  if (trace.sources.length > 0) {
    const names = [...new Set(trace.sources.map((s) => s.filename))];
    bits.push({
      icon: BookOpen,
      text:
        names.slice(0, 2).join(", ") +
        (names.length > 2 ? ` +${names.length - 2} more` : "") +
        (trace.retrieval_ms !== null ? ` · ${trace.retrieval_ms}ms` : ""),
    });
  }
  for (const tool of trace.tools) {
    bits.push({
      icon: tool.tool_name.startsWith("calcom") ? CalendarCheck : Wrench,
      text:
        (TOOL_LABELS[tool.tool_name] ?? tool.tool_name) +
        (tool.latency_ms !== null ? ` · ${tool.latency_ms}ms` : "") +
        (tool.status !== "success" ? ` · ${tool.status}` : ""),
    });
  }
  if (bits.length === 0) return null;

  return (
    <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
      {bits.map((bit, i) => (
        <li
          key={i}
          className="flex items-center gap-1 text-[0.6875rem] text-[var(--ink-subtle)]"
        >
          <bit.icon className="h-3 w-3 shrink-0" />
          {bit.text}
        </li>
      ))}
    </ul>
  );
}

/** Three things a visitor would actually open a chat to ask. Shown only on an
 *  empty conversation — a blank box with a cursor is the hardest thing to
 *  start testing against. */
function Starters({
  agent,
  onPick,
}: {
  agent: Agent;
  onPick: (text: string) => void;
}) {
  const prompts = [
    agent.knowledge_trained
      ? "What are your opening hours?"
      : "What can you help me with?",
    "Do you offer a free consultation?",
    "Can I book a meeting next week?",
  ];

  return (
    <div className="mx-auto max-w-md space-y-4 py-12 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-[var(--radius)] bg-[var(--accent-soft)] text-[var(--amber-ink)]">
        <MessagesSquare className="h-6 w-6" />
      </span>
      <div>
        <p className="font-[family-name:var(--font-display)] text-lg font-bold">
          Chat with {agent.name}
        </p>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          {agent.knowledge_trained
            ? "Ask it something its documents cover, or ask to book a meeting."
            : "It has no knowledge base yet, so it answers from its prompt alone."}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPick(prompt)}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 text-sm text-[var(--ink-muted)] transition-colors hover:border-[var(--amber)] hover:text-[var(--ink)]"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Full-window chat with one agent — the chat equivalent of a web test call.
 *  Sessions are stored server-side, so the transcript and tool trace end up in
 *  the logs exactly like a phone call's. */
export function ChatPanel({ agent }: { agent: Agent }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionId = useRef<string | undefined>(undefined);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep the newest turn in view as the conversation grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, sending]);

  async function submit(text: string) {
    const message = text.trim();
    if (!message || sending) return;

    setDraft("");
    setError(null);
    setTurns((prev) => [...prev, { role: "user", content: message }]);
    setSending(true);

    const result = await sendChatMessage(agent.id, message, sessionId.current);
    setSending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    // The first reply names the session; every later turn continues it.
    sessionId.current = result.reply.session_id;
    setTurns((prev) => [
      ...prev,
      { role: "assistant", content: result.reply.answer, trace: result.reply.trace },
    ]);
    inputRef.current?.focus();
  }

  /** Drop the session id so the next message starts a fresh conversation —
   *  the old one stays in the logs, it just stops being the context. */
  function reset() {
    sessionId.current = undefined;
    setTurns([]);
    setError(null);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter makes a new line — what every chat app does.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit(draft);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-[var(--surface-sunk)]">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {/* The way out. This page has no sidebar, so without it the only
              route back is the browser's back button. */}
          <Link
            href="/dashboard/agents"
            aria-label="Back to agents"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius)] border border-[var(--border)] text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-sunk)] hover:text-[var(--ink)]"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-[family-name:var(--font-display)] text-base font-bold">
              {agent.name}
            </h1>
            <p className="truncate text-xs text-[var(--ink-muted)]">
              {agent.knowledge_trained
                ? "Answering from its knowledge base"
                : "No knowledge base yet"}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={reset}
          disabled={turns.length === 0 || sending}
        >
          <RotateCcw className="h-4 w-4" />
          New conversation
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 sm:px-6">
          {turns.length === 0 && <Starters agent={agent} onPick={submit} />}

          {turns.map((turn, i) => (
            <div
              key={i}
              className={turn.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div className={turn.role === "user" ? "max-w-[85%]" : "max-w-[90%]"}>
                <div
                  className={
                    turn.role === "user"
                      ? "rounded-[calc(var(--radius)*1.2)] rounded-br-sm bg-[var(--navy)] px-4 py-2.5 text-sm text-white"
                      : "rounded-[calc(var(--radius)*1.2)] rounded-bl-sm border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--ink)] shadow-[var(--shadow-sm)]"
                  }
                >
                  <p className="whitespace-pre-wrap">{turn.content}</p>
                </div>
                {turn.trace && <TraceLine trace={turn.trace} />}
              </div>
            </div>
          ))}

          {sending && (
            <p
              className="flex items-center gap-1.5 text-sm text-[var(--ink-muted)]"
              aria-live="polite"
            >
              <span className="inline-flex gap-1">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    style={{ animationDelay: `${delay}ms` }}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--ink-subtle)]"
                  />
                ))}
              </span>
              Thinking…
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-[var(--radius)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]"
            >
              {error}
            </p>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(draft);
        }}
        className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-6"
      >
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a message…"
            aria-label="Message"
            rows={1}
            maxLength={4000}
            className="max-h-40 min-h-10 flex-1 resize-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--ink-subtle)] focus-visible:border-[var(--amber)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          />
          <Button type="submit" variant="brand" disabled={sending || !draft.trim()}>
            <Send className="h-4 w-4" />
            Send
          </Button>
        </div>
        <p className="mx-auto mt-1.5 w-full max-w-3xl text-[0.6875rem] text-[var(--ink-subtle)]">
          Enter to send · Shift + Enter for a new line. This conversation is
          saved to your logs.
        </p>
      </form>
    </div>
  );
}
