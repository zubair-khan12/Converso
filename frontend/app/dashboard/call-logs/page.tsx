import Link from "next/link";

import { CallLogsPanel } from "@/components/dashboard/call-logs-panel";
import { getCallLogs, getVapiStatus } from "@/lib/session";

export const metadata = {
  title: "Conversations · Converso",
};

type Channel = "voice" | "chat";

const TABS: { channel: Channel; label: string }[] = [
  { channel: "voice", label: "Calls" },
  { channel: "chat", label: "Chats" },
];

type Props = {
  // Async in this version of Next.js — see AGENTS.md.
  searchParams: Promise<{ channel?: string }>;
};

/**
 * Calls and chats are the same `Conversation` rows split by channel, so they
 * share one screen and one API — but never one list: a chat row has no
 * recording, duration or caller, and interleaving them would make every column
 * half-empty. Not Vapi-gated as a whole, since chat conversations exist without
 * a Vapi account.
 */
export default async function CallLogsPage({ searchParams }: Props) {
  const { channel: raw } = await searchParams;
  const channel: Channel = raw === "chat" ? "chat" : "voice";

  const [{ calls, total, has_more }, vapi] = await Promise.all([
    getCallLogs(channel),
    getVapiStatus(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Conversations</h1>
        <p className="page-sub">
          {channel === "chat"
            ? "Every chat your agents handled — read the transcript and see what the agent looked up mid-conversation."
            : "Every call your agents handled — play the recording, read the transcript, and see what the agent looked up mid-call."}
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Conversation channel"
        className="inline-grid grid-cols-2 gap-1 rounded-[calc(var(--radius)*1.2)] border border-[var(--border)] bg-[var(--surface-sunk)] p-1"
      >
        {TABS.map((tab) => {
          const selected = tab.channel === channel;
          return (
            <Link
              key={tab.channel}
              href={`/dashboard/call-logs?channel=${tab.channel}`}
              role="tab"
              aria-selected={selected}
              className={
                selected
                  ? "rounded-[var(--radius)] bg-[var(--surface)] px-5 py-2 text-center text-sm font-semibold text-[var(--ink)] shadow-[var(--shadow-sm)]"
                  : "rounded-[var(--radius)] px-5 py-2 text-center text-sm font-medium text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {channel === "voice" && !vapi.connected && (
        <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-sunk)] px-4 py-3 text-sm text-[var(--ink-muted)]">
          Calls run through your Vapi account.{" "}
          <Link
            href="/dashboard/vapi-setup"
            className="font-semibold text-[var(--amber-ink)] underline underline-offset-2"
          >
            Connect Vapi
          </Link>{" "}
          to start taking them — chat conversations work without it.
        </p>
      )}

      <CallLogsPanel
        calls={calls}
        total={total}
        hasMore={has_more}
        channel={channel}
      />
    </div>
  );
}
