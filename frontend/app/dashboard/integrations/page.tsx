import { CalcomPanel } from "@/components/dashboard/calcom-panel";
import { getAgents, getCalcomStatus } from "@/lib/session";

export const metadata = {
  title: "Integrations · Converso",
};

// Not Vapi-gated: Cal.com books meetings for chat agents too, and those exist
// without a Vapi account — gating this screen would make scheduling
// unreachable for a chat-only tenant.
export default async function IntegrationsPage() {
  const [calcom, agents] = await Promise.all([getCalcomStatus(), getAgents()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">
          Integrations
        </h1>
        <p className="page-sub">
          Connect the tools your agents can use mid-call.
        </p>
      </div>

      <CalcomPanel status={calcom} agents={agents} />
    </div>
  );
}
