import { Bot, Lock, MessagesSquare, Plus, Radio } from "lucide-react";

import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Voice agents are live; chat agents are on the roadmap. The chat tab stays
 * visible so the direction is clear, but it can't be opened — hovering or
 * focusing it explains why.
 */
export function AgentsPanel() {
  return (
    <section className="space-y-4">
      <div
        role="tablist"
        aria-label="Agent type"
        className="grid w-full grid-cols-2 gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-sunk)] p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected
          className="flex items-center justify-center gap-2 rounded-lg bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold text-[var(--ink)] shadow-[var(--shadow-sm)] transition-colors"
        >
          <Radio className="h-4 w-4 text-[var(--amber-ink)]" />
          Voice agents
        </button>

        {/* Locked tab. aria-disabled (not `disabled`) so it stays hoverable,
            focusable, and can announce why it's unavailable. */}
        <div className="group relative">
          <button
            type="button"
            role="tab"
            aria-selected={false}
            aria-disabled
            aria-describedby="chat-agents-soon"
            className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-[var(--ink-muted)] opacity-70 transition-opacity group-hover:opacity-100"
          >
            <MessagesSquare className="h-4 w-4" />
            Chat agents
            <Lock className="h-3.5 w-3.5" />
          </button>

          <span
            id="chat-agents-soon"
            role="tooltip"
            className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 flex -translate-x-1/2 translate-y-1 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[var(--ink)] px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-[var(--shadow-md)] transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
          >
            <Lock className="h-3 w-3" />
            Launching soon
            <span
              aria-hidden
              className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 rounded-[1px] bg-[var(--ink)]"
            />
          </span>
        </div>
      </div>

      <Card role="tabpanel" aria-label="Voice agents">
        <CardHeader>
          <CardTitle className="text-base">My agents</CardTitle>
          <CardAction className="self-center">
            <Button
              size="lg"
              className="gap-1.5 bg-gradient-to-br from-[var(--yellow)] to-[var(--amber)] px-3.5 text-[var(--ink)] hover:opacity-95"
            >
              <Plus className="h-4 w-4" />
              New agent
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Bot}
            title="No agents to show yet"
            body="Create a voice agent, give it a personality and a knowledge base, then connect a number."
            action={
              <Button variant="outline" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Create your first agent
              </Button>
            }
          />
        </CardContent>
      </Card>
    </section>
  );
}
