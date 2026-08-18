import { AgentsPanel } from "@/components/dashboard/agents-panel";
import { getAgents, getVapiStatus } from "@/lib/session";

export const metadata = {
  title: "Agents · Converso",
};

// Deliberately not Vapi-gated as a whole: chat agents need no Vapi account, so
// bouncing the entire screen would hide a feature that works. The voice half
// says what's missing instead, and the backend still rejects voice-agent writes
// without a connected key (see app/agents/router.py).
export default async function AgentsPage() {
  const [status, agents] = await Promise.all([getVapiStatus(), getAgents()]);

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

      <AgentsPanel agents={agents} vapiConnected={status.connected} />
    </div>
  );
}
