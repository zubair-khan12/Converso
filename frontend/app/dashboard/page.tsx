import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/lib/session";

// Placeholder landing spot after login. The real dashboard comes next — this
// screen doubles as the first proof that shadcn/ui components render on-brand.
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(60%_55%_at_50%_0%,rgba(107,142,35,0.14),transparent_70%)] p-6">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="flex flex-col items-center gap-1.5">
          <span className="w-fit rounded-full bg-[rgba(107,142,35,0.16)] px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#3f5c14]">
            Signed in
          </span>
          <CardTitle className="mt-2 font-[family-name:var(--font-display)] text-2xl">
            You&apos;re in. 🎉
          </CardTitle>
          <CardDescription className="text-base">
            Signed in as <strong className="text-foreground">{user.email}</strong>.
            The workspace dashboard is coming next — this card is a shadcn/ui
            component, themed to the Converso palette.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Landing/login stay hand-crafted; app screens like this one are built
          from shadcn primitives.
        </CardContent>
        <CardFooter className="justify-center">
          <form action="/api/auth/logout" method="post">
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </CardFooter>
      </Card>
    </main>
  );
}
