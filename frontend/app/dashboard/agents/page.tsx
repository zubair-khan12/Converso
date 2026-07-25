import { redirect } from "next/navigation";

import { AgentsPanel } from "@/components/dashboard/agents-panel";
import { getVapiStatus } from "@/lib/session";

export const metadata = {
  title: "Agents · Converso",
};

// Enforced server-side, not just hidden in the sidebar — a direct hit on this
// URL without a connected Vapi account bounces to the setup page instead of
// rendering. There's no agents API yet (see the approved plan); once built,
// POST /api/agents must independently reject creation without a connected
// key too, so the gate holds even if this page-level redirect is bypassed.
export default async function AgentsPage() {
  const status = await getVapiStatus();
  if (!status.connected) redirect("/dashboard/vapi-setup");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight sm:text-3xl">
          Agents
        </h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Create and manage the voice agents that answer your calls.
        </p>
      </div>

      <AgentsPanel />
    </div>
  );
}
