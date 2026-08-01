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
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight sm:text-3xl">
          Integrations
        </h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Connect the tools your agents can use mid-call.
        </p>
      </div>

      <CalcomPanel status={calcom} agents={agents} />
    </div>
  );
}
