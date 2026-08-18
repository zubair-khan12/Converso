"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";

import { AuthCard, AuthLayout } from "@/components/brand/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { signup } from "@/lib/api";

const HIGHLIGHTS = [
  "Build a voice or chat agent in a few minutes",
  "Give it your own documents to answer from",
  "Add a phone number, or paste the chat widget on your site",
];

/** Minimum enforced by the backend too — this copy just means nobody finds
 *  out about it by being rejected. */
const MIN_PASSWORD = 8;

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD) {
      setError(`Please choose a password of at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setLoading(true);
    const result = await signup({ name, organization, email, password });
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    // The cookie is already set. A signup is by definition a first login, so
    // they always go through the tour rather than landing on an empty dashboard.
    router.push("/getting-started");
  }

  return (
    <AuthLayout
      headline={
        <>
          Start answering
          <br />
          every call.
        </>
      }
      highlights={HIGHLIGHTS}
    >
      <AuthCard
        title="Create your account"
        subtitle="Set up your workspace and try it out."
      >
        <form className="mt-7 flex flex-col gap-5" onSubmit={onSubmit} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="organization">Organization</Label>
            <Input
              id="organization"
              inputSize="lg"
              autoComplete="organization"
              placeholder="Acme Ltd"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              required
              autoFocus
            />
            <p className="text-sm text-[var(--ink-muted)]">
              Your workspace name. Your agents, numbers and documents live here.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              inputSize="lg"
              autoComplete="name"
              placeholder="Jane Cooper"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Work email</Label>
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
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              inputSize="lg"
              autoComplete="new-password"
              placeholder={`At least ${MIN_PASSWORD} characters`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
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
            {loading ? "Creating your workspace…" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--ink-muted)]">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-[var(--amber-ink)] underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </AuthCard>

      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </Link>
    </AuthLayout>
  );
}
