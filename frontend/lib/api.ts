// CLIENT-SIDE API calls. These hit our own Next.js Route Handlers (same origin),
// which is what sets the httpOnly cookie — the browser never calls the backend
// directly, so the JWT is never exposed to JavaScript.
import type { Agent, CallCredentials, SessionUser, VapiStatus } from "./types";

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

export type VapiConnectResult =
  | { ok: true; status: VapiStatus }
  | { ok: false; error: string };

export async function connectVapi(input: {
  api_key?: string;
  public_key?: string;
}): Promise<VapiConnectResult> {
  let res: Response;
  try {
    res = await fetch("/api/integrations/vapi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error ?? "Something went wrong. Try again." };
  }
  return { ok: true, status: data as VapiStatus };
}

export async function disconnectVapi(): Promise<VapiConnectResult> {
  let res: Response;
  try {
    res = await fetch("/api/integrations/vapi", { method: "DELETE" });
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error ?? "Something went wrong. Try again." };
  }
  return { ok: true, status: data as VapiStatus };
}

export type CallCredentialsResult =
  | { ok: true; credentials: CallCredentials }
  | { ok: false; error: string };

/** Fetch the public key + assistant id needed to start a web test call. */
export async function getCallCredentials(
  agentId: string,
): Promise<CallCredentialsResult> {
  let res: Response;
  try {
    res = await fetch(`/api/agents/${agentId}/call`);
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error ?? "Could not start the call." };
  }
  return { ok: true, credentials: data as CallCredentials };
}

// --- Agents ---

export type AgentInput = {
  name: string;
  base_prompt: string;
  voice_id: string;
  temperature: number;
  first_message: string;
};

export type AgentResult =
  | { ok: true; agent: Agent }
  | { ok: false; error: string };

export type AgentActionResult = { ok: true } | { ok: false; error: string };

export async function createAgent(input: AgentInput): Promise<AgentResult> {
  return agentWrite("/api/agents", "POST", input);
}

export async function updateAgent(
  id: string,
  input: Partial<AgentInput>,
): Promise<AgentResult> {
  return agentWrite(`/api/agents/${id}`, "PATCH", input);
}

export async function retryAgent(id: string): Promise<AgentResult> {
  return agentWrite(`/api/agents/${id}/retry`, "POST");
}

export async function deleteAgent(id: string): Promise<AgentActionResult> {
  let res: Response;
  try {
    res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error ?? "Could not delete the agent." };
  }
  return { ok: true };
}

async function agentWrite(
  url: string,
  method: string,
  body?: unknown,
): Promise<AgentResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error ?? "Something went wrong. Try again." };
  }
  return { ok: true, agent: data as Agent };
}
