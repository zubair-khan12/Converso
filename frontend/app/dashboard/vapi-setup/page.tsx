import { VapiSetupForm } from "@/components/dashboard/vapi-setup-form";
import { getVapiStatus } from "@/lib/session";

export const metadata = {
  title: "Configure Vapi · Converso",
};

export default async function VapiSetupPage() {
  const status = await getVapiStatus();

  return (
    <div className="flex justify-center">
      {/* Header and card share one column, left-aligned like every other
          dashboard page, with the whole column centered on the page. */}
      <div className="w-full max-w-2xl space-y-6 py-6">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight sm:text-3xl">
            Configure Vapi
          </h1>
          <p className="mt-1 text-[var(--ink-muted)]">
            Connect your Vapi.ai account so Converso can create and run voice
            agents on your behalf.
          </p>
        </div>

        <VapiSetupForm initialStatus={status} />
      </div>
    </div>
  );
}
