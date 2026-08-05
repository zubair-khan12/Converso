import Link from "next/link";

import { Logo, LogoMark } from "@/components/brand/logo";

/** The split-screen frame shared by sign-in and sign-up: a navy brand panel
 *  and a form column. Both pages had the same panel; keeping one copy means
 *  the two can't drift apart, and the copy on it is a prop because "welcome
 *  back" and "start here" want to say different things. */
export function AuthLayout({
  headline,
  highlights,
  children,
}: {
  /** Rendered on the navy panel. Use <br /> to control the line breaks. */
  headline: React.ReactNode;
  highlights: string[];
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen w-full lg:grid-cols-[1.05fr_1fr]">
      {/* Hidden below lg so the phone gets its full width for the form rather
          than a decorative header pushing it off-screen. */}
      <aside className="relative hidden overflow-hidden bg-[var(--navy)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[radial-gradient(circle,var(--accent-glow),transparent_65%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-[radial-gradient(circle,var(--accent-glow-faint),transparent_65%)]"
        />

        <Link href="/" className="relative inline-flex items-center gap-3">
          <LogoMark tone="light" className="h-10 w-10" />
          <span className="font-[family-name:var(--font-display)] text-xl font-extrabold tracking-[-0.03em]">
            converso
          </span>
        </Link>

        <div className="relative max-w-md">
          <h2 className="font-[family-name:var(--font-display)] text-[2.5rem] font-extrabold leading-[1.08] tracking-[-0.03em]">
            {headline}
          </h2>
          <ul className="mt-8 space-y-3.5">
            {highlights.map((line) => (
              <li key={line} className="flex items-start gap-3 text-white/80">
                <span
                  aria-hidden
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--gold)]"
                />
                <span className="text-[0.9375rem]">{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-white/50">
          © {new Date().getFullYear()} Converso
        </p>
      </aside>

      <div className="flex flex-col justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto w-full max-w-[460px]">
          <Link href="/" className="mb-8 inline-flex lg:hidden">
            <Logo size="md" />
          </Link>
          {children}
        </div>
      </div>
    </main>
  );
}

/** The white card both auth forms sit in. */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[calc(var(--radius)*1.6)] border border-[var(--border)] bg-[var(--surface)] p-7 shadow-[var(--shadow-md)] sm:p-9">
      <h1 className="text-[1.75rem] font-bold tracking-[-0.025em]">{title}</h1>
      <p className="mt-1.5 text-[var(--ink-muted)]">{subtitle}</p>
      {children}
    </div>
  );
}
