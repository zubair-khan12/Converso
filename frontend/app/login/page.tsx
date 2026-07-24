"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[radial-gradient(60%_55%_at_50%_0%,rgba(244,201,93,0.22),transparent_70%)] p-12">
      <div className="flex w-full max-w-[400px] flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[var(--shadow-lg)]">
        <Link
          href="/"
          aria-label="Converso home"
          className="flex items-center gap-2.5 self-start font-[family-name:var(--font-display)] text-lg font-bold tracking-tight"
        >
          <span
            aria-hidden
            className="h-5 w-5 rounded-md bg-gradient-to-br from-[var(--yellow)] to-[var(--amber)] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.4)]"
          />
          Converso
        </Link>

        <h1 className="mt-6 font-[family-name:var(--font-display)] text-[1.7rem] font-bold tracking-tight">
          Welcome back
        </h1>
        <p className="mt-1.5 text-[var(--ink-muted)]">Sign in to your workspace.</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
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
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-[var(--radius)] border border-red-600/20 bg-red-600/8 px-3 py-2.5 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="mt-1 w-full bg-gradient-to-br from-[var(--yellow)] to-[var(--amber)] text-[var(--ink)] hover:opacity-95"
          >
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-[var(--ink-muted)]">
          Accounts are provisioned by your administrator.
        </p>
      </div>

      <Link
        href="/"
        className="text-sm font-medium text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
      >
        ← Back to home
      </Link>
    </main>
  );
}
