import { redirect } from "next/navigation";

import { AgentsPanel } from "@/components/dashboard/agents-panel";
import { getAgents, getVapiStatus } from "@/lib/session";

export const metadata = {
  title: "Agents · Converso",
};

// Enforced server-side, not just hidden in the sidebar — a direct hit on this
// URL without a connected Vapi account bounces to the setup page. The backend
// independently rejects agent writes without a connected key too
// (see app/agents/router.py), so the gate holds even if this is bypassed.
export default async function AgentsPage() {
  const status = await getVapiStatus();
  if (!status.connected) redirect("/dashboard/vapi-setup");

  const agents = await getAgents();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">
          Agents
        </h1>
        <p className="page-sub">
          Create and manage the voice agents that answer your calls.
        </p>
      </div>

      <AgentsPanel agents={agents} />
    </div>
  );
}
