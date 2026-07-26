import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/shell";
import { getCurrentUser, getVapiStatus } from "@/lib/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const vapiStatus = await getVapiStatus();

  return (
    <DashboardShell user={user} vapiConnected={vapiStatus.connected}>
      {children}
    </DashboardShell>
  );
}
