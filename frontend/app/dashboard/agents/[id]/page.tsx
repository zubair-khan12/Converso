import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AgentForm } from "@/components/dashboard/agent-form";
import { getAgent, getVapiStatus, getVoices } from "@/lib/session";

export const metadata = {
  title: "Edit agent · Converso",
};

export default async function EditAgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const status = await getVapiStatus();
  if (!status.connected) redirect("/dashboard/vapi-setup");

  const { id } = await params;
  const [agent, voices] = await Promise.all([getAgent(id), getVoices()]);
  if (!agent) notFound();

  return (
    <div className="flex justify-center">
      <div className="w-full max-w-2xl space-y-6 py-6">
        <div>
          <Link
            href="/dashboard/agents"
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to agents
          </Link>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight sm:text-3xl">
            Edit {agent.name}
          </h1>
          <p className="mt-1 text-[var(--ink-muted)]">
            Changes are synced to the Vapi assistant when you save.
          </p>
        </div>

        <AgentForm voices={voices} agent={agent} />
      </div>
    </div>
  );
}
