// SERVER-ONLY session helpers. These read/write the httpOnly cookie and talk to
// the FastAPI backend server-to-server — never import this from a client component.
import { cookies } from "next/headers";
import { cache } from "react";

import { BACKEND_URL, COOKIE_SECURE, SESSION_COOKIE } from "./env";
import type { SessionUser, VapiStatus } from "./types";

/** Exchange credentials with the backend. Returns the raw fetch Response. */
export async function backendLogin(email: string, password: string): Promise<Response> {
  return fetch(`${BACKEND_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
}

/** Store the JWT as an httpOnly session cookie on the Next.js origin. */
export async function setSessionCookie(token: string, maxAgeSeconds: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

/** Tell the backend the user has seen the tour, so it won't show again. */
export async function markOnboarded(token: string): Promise<Response> {
  return fetch(`${BACKEND_URL}/api/auth/onboarded`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}

/** Remove the session cookie (logout). */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** The raw JWT from the cookie, or undefined if not signed in. */
export async function getSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

/** Verify the session against the backend and return the user, or null.
 *  Wrapped in React `cache` so the layout and page share one /me call per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = await getSessionToken();
  if (!token) return null;

  const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) return null;
  const { user } = await res.json();
  return user as SessionUser;
});

/** Whether the current tenant has a working Vapi connection. Wrapped in
 *  `cache` so a layout gate and the page body share one call per request. */
export const getVapiStatus = cache(async (): Promise<VapiStatus> => {
  const token = await getSessionToken();
  if (!token) return { connected: false, masked_key: null };

  const res = await fetch(`${BACKEND_URL}/api/integrations/vapi`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) return { connected: false, masked_key: null };
  return res.json();
});

/** Validate + store a tenant's Vapi API key. Returns the raw fetch Response. */
export async function connectVapiBackend(token: string, apiKey: string): Promise<Response> {
  return fetch(`${BACKEND_URL}/api/integrations/vapi`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
    cache: "no-store",
  });
}

/** Remove the tenant's stored Vapi API key. Returns the raw fetch Response. */
export async function disconnectVapiBackend(token: string): Promise<Response> {
  return fetch(`${BACKEND_URL}/api/integrations/vapi`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}
