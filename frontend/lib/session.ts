// SERVER-ONLY session helpers. These read/write the httpOnly cookie and talk to
// the FastAPI backend server-to-server — never import this from a client component.
import { cookies } from "next/headers";
import { cache } from "react";

import { BACKEND_URL, COOKIE_SECURE, SESSION_COOKIE } from "./env";
import type {
  Agent,
  CalcomStatus,
  KnowledgeDocument,
  PhoneNumber,
  ProviderStatus,
  SessionUser,
  VapiStatus,
  Voice,
} from "./types";

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
  if (!token) return { connected: false, masked_key: null, has_public_key: false };

  const res = await fetch(`${BACKEND_URL}/api/integrations/vapi`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) return { connected: false, masked_key: null, has_public_key: false };
  return res.json();
});

/** Validate + store a tenant's Vapi keys. Returns the raw fetch Response. */
export async function connectVapiBackend(
  token: string,
  body: { api_key?: string; public_key?: string },
): Promise<Response> {
  return fetch(`${BACKEND_URL}/api/integrations/vapi`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

/** The tenant's voice agents, newest first. Empty on any error. */
export const getAgents = cache(async (): Promise<Agent[]> => {
  const token = await getSessionToken();
  if (!token) return [];

  const res = await fetch(`${BACKEND_URL}/api/agents`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) return [];
  const { agents } = await res.json();
  return agents as Agent[];
});

/** A single agent, or null if not found / not owned by this tenant. */
export async function getAgent(id: string): Promise<Agent | null> {
  const token = await getSessionToken();
  if (!token) return null;

  const res = await fetch(`${BACKEND_URL}/api/agents/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) return null;
  return res.json();
}

/** An agent's knowledge sources (documents), oldest first. Empty on any error. */
export async function getDocuments(agentId: string): Promise<KnowledgeDocument[]> {
  const token = await getSessionToken();
  if (!token) return [];

  const res = await fetch(`${BACKEND_URL}/api/agents/${agentId}/documents`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) return [];
  const { documents } = await res.json();
  return documents as KnowledgeDocument[];
}

/** The tenant's phone numbers, newest first. Empty on any error. */
export const getPhoneNumbers = cache(async (): Promise<PhoneNumber[]> => {
  const token = await getSessionToken();
  if (!token) return [];

  const res = await fetch(`${BACKEND_URL}/api/telephony/numbers`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) return [];
  const { phone_numbers } = await res.json();
  return phone_numbers as PhoneNumber[];
});

const DISCONNECTED_PROVIDER: ProviderStatus = { connected: false, masked_key: null };

async function getProviderStatus(provider: "twilio" | "telnyx"): Promise<ProviderStatus> {
  const token = await getSessionToken();
  if (!token) return DISCONNECTED_PROVIDER;

  const res = await fetch(`${BACKEND_URL}/api/integrations/${provider}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) return DISCONNECTED_PROVIDER;
  return res.json();
}

/** Whether the tenant has connected Twilio (for bring-your-own numbers). */
export const getTwilioStatus = cache(() => getProviderStatus("twilio"));

/** Whether the tenant has connected Telnyx (for bring-your-own numbers). */
export const getTelnyxStatus = cache(() => getProviderStatus("telnyx"));

const DISCONNECTED_CALCOM: CalcomStatus = {
  connected: false,
  masked_key: null,
  organizer_email: null,
  time_zone: null,
  event_types: [],
  event_type_id: null,
  event_title: null,
  length_minutes: null,
  agent_id: null,
  agent_name: null,
  scheduling_prompt: null,
};

/** The tenant's Cal.com connection, including a live event-type list. */
export const getCalcomStatus = cache(async (): Promise<CalcomStatus> => {
  const token = await getSessionToken();
  if (!token) return DISCONNECTED_CALCOM;

  const res = await fetch(`${BACKEND_URL}/api/integrations/calcom`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) return DISCONNECTED_CALCOM;
  return res.json();
});

/** The catalog of built-in voices an agent can use. */
export const getVoices = cache(async (): Promise<Voice[]> => {
  const token = await getSessionToken();
  if (!token) return [];

  const res = await fetch(`${BACKEND_URL}/api/vapi/voices`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) return [];
  const { voices } = await res.json();
  return voices as Voice[];
});
