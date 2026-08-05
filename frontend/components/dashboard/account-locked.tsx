import Link from "next/link";
import { Lock, Mail } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

/** Shown in place of the whole dashboard when a tenant's account is disabled.
 *
 *  Deliberately reachable *after* a successful sign-in rather than failing the
 *  login: a locked-out customer who gets "invalid email or password" concludes
 *  the product is broken and doesn't get in touch — which is the opposite of
 *  what you want from someone who owes you money. */
export function AccountLocked({
  organization,
  reason,
  contactEmail,
}: {
  organization?: string | null;
  reason?: string | null;
  contactEmail: string;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-[480px]">
        <Link href="/" className="mb-8 inline-flex">
          <Logo size="md" />
        </Link>

        <div className="rounded-[calc(var(--radius)*1.6)] border border-[var(--border)] bg-[var(--surface)] p-7 shadow-[var(--shadow-md)] sm:p-9">
          <span className="grid h-11 w-11 place-items-center rounded-[var(--radius)] bg-[var(--danger-soft)] text-[var(--danger)]">
            <Lock className="h-5 w-5" />
          </span>

          <h1 className="mt-5 text-[1.5rem] font-bold tracking-[-0.02em]">
            {organization ? `${organization} is on hold` : "Account on hold"}
          </h1>
          {/* Two paragraphs rather than one: the reason is supplied by the
              server and already ends in a full stop, so running our own
              sentence onto it depends on JSX whitespace behaving. */}
          <p className="mt-2 text-[var(--ink-muted)]">
            {reason ?? "This account is not active."}
          </p>
          <p className="mt-2 text-[var(--ink-muted)]">
            Your agents, documents and settings are all still here —
            they&rsquo;ll be exactly as you left them once it&rsquo;s
            reactivated.
          </p>

          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            <Button variant="brand" render={<a href={`mailto:${contactEmail}`} />} nativeButton={false}>
              <Mail className="h-4 w-4" />
              Get in touch
            </Button>
            {/* A plain form POST rather than a link: the logout route is
                POST-only (a GET logout is trivially triggerable by any image
                tag), and this keeps the screen a server component. */}
            <form action="/api/auth/logout" method="post">
              <Button type="submit" variant="outline" className="w-full sm:w-auto">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
