import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { getCurrentUser, getDashboardSummary } from "@/lib/session";

// The dashboard layout already gates auth; user is guaranteed here.
export default async function DashboardPage() {
  const [user, summary] = await Promise.all([
    getCurrentUser(),
    getDashboardSummary(),
  ]);
  return <DashboardContent user={user!} summary={summary} />;
}
