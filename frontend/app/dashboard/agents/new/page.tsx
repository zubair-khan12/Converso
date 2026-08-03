import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AgentForm } from "@/components/dashboard/agent-form";
import { getVapiStatus, getVoices } from "@/lib/session";

export const metadata = {
  title: "New agent · Converso",
};

export default async function NewAgentPage() {
  const status = await getVapiStatus();
  if (!status.connected) redirect("/dashboard/vapi-setup");

  const voices = await getVoices();

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
          <h1 className="page-title">
            New voice agent
          </h1>
          <p className="page-sub">
            Give it a name, a voice, and a prompt. It&apos;s provisioned on Vapi
            the moment you create it.
          </p>
        </div>

        <AgentForm voices={voices} />
      </div>
    </div>
  );
}
