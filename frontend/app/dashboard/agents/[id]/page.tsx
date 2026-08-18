import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AgentForm } from "@/components/dashboard/agent-form";
import { WidgetPanel } from "@/components/dashboard/widget-panel";
import { getAgent, getVoices } from "@/lib/session";

export const metadata = {
  title: "Edit agent · Converso",
};

// Not Vapi-gated: a chat agent is edited here too and never touches Vapi.
export default async function EditAgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = await getAgent(id);
  if (!agent) notFound();

  // Voice agents need the voice list; a chat agent has no voice to pick.
  const voices = agent.kind === "chat" ? [] : await getVoices();

  return (
    <div>
      <div className="w-full max-w-2xl space-y-6">
        <div>
          <Link
            href="/dashboard/agents"
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to agents
          </Link>
          <h1 className="page-title">Edit {agent.name}</h1>
          <p className="page-sub">
            {agent.kind === "chat"
              ? "Changes apply to the next conversation."
              : "Changes are synced to the Vapi assistant when you save."}
          </p>
        </div>

        <AgentForm voices={voices} agent={agent} />
        <WidgetPanel agent={agent} />
      </div>
    </div>
  );
}
