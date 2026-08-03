import { VapiSetupForm } from "@/components/dashboard/vapi-setup-form";
import { getVapiStatus } from "@/lib/session";

export const metadata = {
  title: "Configure Vapi · Converso",
};

export default async function VapiSetupPage() {
  const status = await getVapiStatus();

  return (
    <div>
      {/* Header and card share one column, left-aligned like every other
          dashboard page, with the whole column centered on the page. */}
      <div className="w-full max-w-2xl space-y-6">
        <div>
          <h1 className="page-title">
            Configure Vapi
          </h1>
          <p className="page-sub">
            Connect your Vapi.ai account so Converso can create and run voice
            agents on your behalf.
          </p>
        </div>

        <VapiSetupForm initialStatus={status} />
      </div>
    </div>
  );
}
