import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { getCurrentUser } from "@/lib/session";

// The dashboard layout already gates auth; user is guaranteed here.
export default async function DashboardPage() {
  const user = (await getCurrentUser())!;
  return <DashboardContent user={user} />;
}
