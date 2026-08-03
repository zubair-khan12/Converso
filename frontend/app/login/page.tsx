"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";

import { Logo, LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/api";

/** What the product actually does, said plainly — the panel is the only place
 *  a signing-in user sees anything but a form, so it should be worth reading. */
const HIGHLIGHTS = [
  "Agents that answer the phone in your business's voice",
  "Grounded in your own documents, not guesswork",
  "Books the meeting on your calendar before the call ends",
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await login(email, password);
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    // Cookie is set. First-timers get the guided tour; everyone else goes
    // straight to work.
    router.push(result.user.onboarded ? "/dashboard" : "/getting-started");
  }

  return (
    <main className="grid min-h-screen w-full lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel. Hidden below lg so the phone gets the full width for the
          form rather than a decorative header pushing it off-screen. */}
      <aside className="relative hidden overflow-hidden bg-[var(--navy)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(224,160,32,0.35),transparent_65%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(224,160,32,0.16),transparent_65%)]"
        />

        <Link href="/" className="relative inline-flex items-center gap-3">
          <LogoMark tone="light" className="h-10 w-10" />
          <span className="font-[family-name:var(--font-display)] text-xl font-extrabold tracking-[-0.03em]">
            converso
          </span>
        </Link>

        <div className="relative max-w-md">
          <h2 className="font-[family-name:var(--font-display)] text-[2.5rem] font-extrabold leading-[1.08] tracking-[-0.03em]">
            Your phone line,
            <br />
            answered by AI.
          </h2>
          <ul className="mt-8 space-y-3.5">
            {HIGHLIGHTS.map((line) => (
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

      {/* Form side */}
      <div className="flex flex-col justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto w-full max-w-[460px]">
          <Link href="/" className="mb-8 inline-flex lg:hidden">
            <Logo size="md" />
          </Link>

          <div className="rounded-[calc(var(--radius)*1.6)] border border-[var(--border)] bg-[var(--surface)] p-7 shadow-[var(--shadow-md)] sm:p-9">
            <h1 className="text-[1.75rem] font-bold tracking-[-0.025em]">
              Welcome back
            </h1>
            <p className="mt-1.5 text-[var(--ink-muted)]">
              Sign in to your workspace.
            </p>

            <form className="mt-7 flex flex-col gap-5" onSubmit={onSubmit} noValidate>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  inputSize="lg"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                {/* The reveal toggle sits inside the field rather than beside
                    it, so the input keeps the full column width. */}
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    inputSize="lg"
                    autoComplete="current-password"
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-[var(--radius)] text-[var(--ink-subtle)] transition-colors hover:bg-[var(--surface-sunk)] hover:text-[var(--ink)]"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4.5 w-4.5" />
                    ) : (
                      <Eye className="h-4.5 w-4.5" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-[var(--radius)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3.5 py-3 text-sm text-[var(--danger)]"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                variant="brand"
                size="lg"
                disabled={loading}
                className="mt-1 w-full"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-[var(--ink-muted)]">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--success)]" />
              Accounts are provisioned by your administrator.
            </p>
          </div>

          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
