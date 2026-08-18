import { redirect } from "next/navigation";

import { CallLogsPanel } from "@/components/dashboard/call-logs-panel";
import { getCallLogs, getVapiStatus } from "@/lib/session";

export const metadata = {
  title: "Call Logs · Converso",
};

// Same gate as the rest of Telephony: calls only exist once Vapi is connected.
export default async function CallLogsPage() {
  const status = await getVapiStatus();
  if (!status.connected) redirect("/dashboard/vapi-setup");

  const { calls, total, has_more } = await getCallLogs();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Call logs</h1>
        <p className="page-sub">
          Every call your agents handled — play the recording, read the
          transcript, and see what the agent looked up mid-call.
        </p>
      </div>

      <CallLogsPanel calls={calls} total={total} hasMore={has_more} />
    </div>
  );
}
