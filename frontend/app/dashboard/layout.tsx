import { redirect } from "next/navigation";

import { AccountLocked } from "@/components/dashboard/account-locked";
import { DashboardShell } from "@/components/dashboard/shell";
import { SUPPORT_EMAIL } from "@/lib/env";
import { getCurrentUser, getVapiStatus } from "@/lib/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Disabled accounts get the explanation instead of the product. The backend
  // refuses their API calls independently — this is so they're told why,
  // rather than meeting a wall of failed requests.
  if (!user.account_enabled) {
    return (
      <AccountLocked
        organization={user.organization}
        reason={user.account_locked_reason}
        contactEmail={SUPPORT_EMAIL}
      />
    );
  }

  const vapiStatus = await getVapiStatus();

  return (
    <DashboardShell user={user} vapiConnected={vapiStatus.connected}>
      {children}
    </DashboardShell>
  );
}
