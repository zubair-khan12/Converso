import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, ChevronRight, Sparkles } from "lucide-react";

import { KnowledgeManager } from "@/components/dashboard/knowledge-manager";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAgent, getAgents, getDocuments, getVapiStatus } from "@/lib/session";

export const metadata = {
  title: "Knowledge Base · Converso",
};

type Props = {
  searchParams: Promise<{ agent?: string }>;
};

// Knowledge base is per-agent. With `?agent=<id>` it manages that agent's
// sources; without it, you pick which agent to work on. Gated behind a Vapi
// connection server-side, same as the Agents tab.
export default async function KnowledgePage({ searchParams }: Props) {
  const status = await getVapiStatus();
  if (!status.connected) redirect("/dashboard/vapi-setup");

  const { agent: agentId } = await searchParams;

  if (agentId) {
    const agent = await getAgent(agentId);
    if (!agent) redirect("/dashboard/knowledge");
    const documents = await getDocuments(agentId);
    return <KnowledgeManager agent={agent} documents={documents} />;
  }

  const agents = await getAgents();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">
          Knowledge base
        </h1>
        <p className="page-sub">
          Pick an agent to give it text and documents to answer from.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Choose an agent</CardTitle>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="No agents yet"
              body="Create a voice agent first, then come back to give it a knowledge base."
              action={
                <Button
                  variant="outline"
                  render={<Link href="/dashboard/agents/new" />}
                  nativeButton={false}
                >
                  Create an agent
                </Button>
              }
            />
          ) : (
            /* Cards rather than full-width rows: a row 1100px wide for a name
               and one line of status leaves the eye travelling for nothing. */
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {agents.map((agent) => (
                <Link
                  key={agent.id}
                  href={`/dashboard/knowledge?agent=${agent.id}`}
                  className="group flex items-center justify-between gap-3 rounded-[calc(var(--radius)*1.2)] border border-[var(--border)] p-4 transition-colors hover:border-[var(--amber)] hover:bg-[var(--accent-softer)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius)] bg-[var(--accent-soft)] text-[var(--amber-ink)]">
                      <Bot className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--ink)]">{agent.name}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-[var(--ink-muted)]">
                        {agent.knowledge_trained ? (
                          <>
                            <Sparkles className="h-3.5 w-3.5 text-[var(--success)]" />
                            Trained
                          </>
                        ) : (
                          "No knowledge base yet"
                        )}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-[var(--ink-subtle)] transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
