// CLIENT-SIDE API calls. These hit our own Next.js Route Handlers (same origin),
// which is what sets the httpOnly cookie — the browser never calls the backend
// directly, so the JWT is never exposed to JavaScript.
import type { SessionUser } from "./types";

export type LoginResult =
  | { ok: true; user: SessionUser }
  | { ok: false; error: string };

export async function login(email: string, password: string): Promise<LoginResult> {
  let res: Response;
  try {
    res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error ?? "Something went wrong. Try again." };
  }
  return { ok: true, user: data.user };
}
