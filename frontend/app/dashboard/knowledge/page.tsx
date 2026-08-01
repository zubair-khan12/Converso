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
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight sm:text-3xl">
          Knowledge base
        </h1>
        <p className="mt-1 text-[var(--ink-muted)]">
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
            <div className="space-y-3">
              {agents.map((agent) => (
                <Link
                  key={agent.id}
                  href={`/dashboard/knowledge?agent=${agent.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-4 transition-colors hover:border-[var(--amber)] hover:bg-[rgba(244,201,93,0.06)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[rgba(244,201,93,0.22)] text-[var(--amber-ink)]">
                      <Bot className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--ink)]">{agent.name}</p>
                      <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
                        {agent.knowledge_trained
                          ? "Knowledge base trained"
                          : "No knowledge base yet"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {agent.knowledge_trained && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(107,142,35,0.14)] px-2.5 py-1 text-xs font-semibold text-[#4b6115]">
                        <Sparkles className="h-3.5 w-3.5" />
                        RAG
                      </span>
                    )}
                    <ChevronRight className="h-5 w-5 text-[var(--ink-muted)]" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
