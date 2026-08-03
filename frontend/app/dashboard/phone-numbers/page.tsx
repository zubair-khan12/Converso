import { redirect } from "next/navigation";

import { PhoneNumbersPanel } from "@/components/dashboard/phone-numbers-panel";
import {
  getAgents,
  getPhoneNumbers,
  getTelnyxStatus,
  getTwilioStatus,
  getVapiStatus,
} from "@/lib/session";

export const metadata = {
  title: "Phone Numbers · Converso",
};

// Same gate as Agents/Knowledge Base: a phone number is provisioned through
// Vapi, so nothing here works without a connected Vapi account.
export default async function PhoneNumbersPage() {
  const status = await getVapiStatus();
  if (!status.connected) redirect("/dashboard/vapi-setup");

  const [phoneNumbers, agents, twilioStatus, telnyxStatus] = await Promise.all([
    getPhoneNumbers(),
    getAgents(),
    getTwilioStatus(),
    getTelnyxStatus(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">
          Phone numbers
        </h1>
        <p className="page-sub">
          Attach a real phone number to an agent so callers can reach it directly.
        </p>
      </div>

      <PhoneNumbersPanel
        phoneNumbers={phoneNumbers}
        agents={agents}
        twilioStatus={twilioStatus}
        telnyxStatus={telnyxStatus}
      />
    </div>
  );
}
