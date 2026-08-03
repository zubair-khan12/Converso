import { redirect } from "next/navigation";

import { CalcomPanel } from "@/components/dashboard/calcom-panel";
import { getAgents, getCalcomStatus, getVapiStatus } from "@/lib/session";

export const metadata = {
  title: "Integrations · Converso",
};

// Same gate as Agents/Knowledge Base: an integration only does anything through
// a live agent, and there are no agents without a connected Vapi account.
export default async function IntegrationsPage() {
  const status = await getVapiStatus();
  if (!status.connected) redirect("/dashboard/vapi-setup");

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
