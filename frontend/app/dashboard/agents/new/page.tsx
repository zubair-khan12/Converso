import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AgentForm } from "@/components/dashboard/agent-form";
import { getVapiStatus, getVoices } from "@/lib/session";
import type { AgentKind } from "@/lib/types";

export const metadata = {
  title: "New agent · Converso",
};

export default async function NewAgentPage({
  searchParams,
}: {
  // Async in this version of Next.js — see AGENTS.md.
  searchParams: Promise<{ kind?: string }>;
}) {
  const status = await getVapiStatus();
  const { kind: rawKind } = await searchParams;
  const kind: AgentKind = rawKind === "chat" ? "chat" : "voice";

  // A chat agent never touches Vapi, so the Vapi gate only applies to voice.
  if (kind === "voice" && !status.connected) redirect("/dashboard/vapi-setup");

  const voices = kind === "chat" ? [] : await getVoices();

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
            {kind === "chat" ? "New chat agent" : "New voice agent"}
          </h1>
          <p className="page-sub">
            {kind === "chat"
              ? "Give it a name and a prompt. It answers in writing from the same knowledge base a voice agent uses, and can book meetings through Cal.com."
              : "Give it a name, a voice, and a prompt. It's provisioned on Vapi the moment you create it."}
          </p>
        </div>

        <AgentForm voices={voices} kind={kind} />
      </div>
    </div>
  );
}
