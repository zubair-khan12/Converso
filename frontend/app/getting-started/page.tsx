import { redirect } from "next/navigation";

import { GettingStarted } from "@/components/onboarding/getting-started";
import { getCurrentUser } from "@/lib/session";

export const metadata = {
  title: "Getting started · Converso",
};

// Shown once, on a user's first sign-in. Returning users are sent straight to
// the dashboard even if they land here by typing the URL.
export default async function GettingStartedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.onboarded) redirect("/dashboard");

  const firstName =
    user.name?.trim().split(/\s+/)[0] || user.email.split("@")[0];

  return <GettingStarted firstName={firstName} />;
}
