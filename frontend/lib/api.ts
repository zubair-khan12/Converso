// CLIENT-SIDE API calls. These hit our own Next.js Route Handlers (same origin),
// which is what sets the httpOnly cookie — the browser never calls the backend
// directly, so the JWT is never exposed to JavaScript.
import type {
  Agent,
  CalcomStatus,
  CallCredentials,
  KnowledgeDocument,
  PhoneNumber,
  ProviderStatus,
  SessionUser,
  TrainingSummary,
  VapiStatus,
} from "./types";

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

export type SignupInput = {
  name: string;
  organization: string;
  email: string;
  password: string;
};

/** Create an organization and sign in as its owner. Same result shape as
 *  `login`, so the caller's success path is identical. */
export async function signup(input: SignupInput): Promise<LoginResult> {
  let res: Response;
  try {
    res = await fetch("/api/auth/signup", {
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

// --- Knowledge base ---

export type DocumentResult =
  | { ok: true; document: KnowledgeDocument }
  | { ok: false; error: string };

export type TrainResult =
  | { ok: true; agent: Agent; training: TrainingSummary }
  | { ok: false; error: string };

/** Add a pasted-text knowledge source to an agent. */
export async function addKnowledgeText(
  agentId: string,
  input: { title: string; text: string },
): Promise<DocumentResult> {
  let res: Response;
  try {
    res = await fetch(`/api/agents/${agentId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error ?? "Could not add the text." };
  }
  return { ok: true, document: data as KnowledgeDocument };
}

/** Upload a PDF / .txt knowledge source to an agent. */
export async function uploadKnowledgeFile(
  agentId: string,
  file: File,
): Promise<DocumentResult> {
  const form = new FormData();
  form.append("file", file);
  let res: Response;
  try {
    res = await fetch(`/api/agents/${agentId}/documents/file`, {
      method: "POST",
      body: form,
    });
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error ?? "Could not upload the file." };
  }
  return { ok: true, document: data as KnowledgeDocument };
}

/** Remove a knowledge source. */
export async function deleteDocument(
  agentId: string,
  docId: string,
): Promise<AgentActionResult> {
  let res: Response;
  try {
    res = await fetch(`/api/agents/${agentId}/documents/${docId}`, {
      method: "DELETE",
    });
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error ?? "Could not delete the document." };
  }
  return { ok: true };
}

/** Chunk + embed the agent's sources and re-provision it on Vapi (RAG brain). */
export async function trainAgent(agentId: string): Promise<TrainResult> {
  let res: Response;
  try {
    res = await fetch(`/api/agents/${agentId}/train`, { method: "POST" });
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error ?? "Could not train the agent." };
  }
  return { ok: true, agent: data.agent as Agent, training: data.training as TrainingSummary };
}

// --- Phone numbers ---

export type PhoneNumberResult =
  | { ok: true; phoneNumber: PhoneNumber }
  | { ok: false; error: string };

export type CreatePhoneNumberInput = {
  provider: "vapi" | "twilio" | "telnyx";
  agent_id?: string;
  area_code?: string;
  number?: string;
};

export async function createPhoneNumber(
  input: CreatePhoneNumberInput,
): Promise<PhoneNumberResult> {
  return phoneNumberWrite("/api/telephony/numbers", "POST", input);
}

export async function reassignPhoneNumber(
  id: string,
  agentId: string,
): Promise<PhoneNumberResult> {
  return phoneNumberWrite(`/api/telephony/numbers/${id}`, "PATCH", { agent_id: agentId });
}

export async function detachPhoneNumber(id: string): Promise<PhoneNumberResult> {
  return phoneNumberWrite(`/api/telephony/numbers/${id}`, "PATCH", { detach: true });
}

export async function retryPhoneNumber(id: string): Promise<PhoneNumberResult> {
  return phoneNumberWrite(`/api/telephony/numbers/${id}/retry`, "POST");
}

export async function deletePhoneNumber(id: string): Promise<AgentActionResult> {
  let res: Response;
  try {
    res = await fetch(`/api/telephony/numbers/${id}`, { method: "DELETE" });
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error ?? "Could not delete the phone number." };
  }
  return { ok: true };
}

async function phoneNumberWrite(
  url: string,
  method: string,
  body?: unknown,
): Promise<PhoneNumberResult> {
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
  return { ok: true, phoneNumber: data as PhoneNumber };
}

// --- Twilio / Telnyx connection (bring-your-own numbers) ---

export type ProviderConnectResult =
  | { ok: true; status: ProviderStatus }
  | { ok: false; error: string };

export async function connectTwilio(input: {
  account_sid: string;
  auth_token: string;
}): Promise<ProviderConnectResult> {
  return providerWrite("/api/integrations/twilio", "POST", input);
}

export async function disconnectTwilio(): Promise<ProviderConnectResult> {
  return providerWrite("/api/integrations/twilio", "DELETE");
}

export async function connectTelnyx(input: {
  credential_id: string;
}): Promise<ProviderConnectResult> {
  return providerWrite("/api/integrations/telnyx", "POST", input);
}

export async function disconnectTelnyx(): Promise<ProviderConnectResult> {
  return providerWrite("/api/integrations/telnyx", "DELETE");
}

async function providerWrite(
  url: string,
  method: string,
  body?: unknown,
): Promise<ProviderConnectResult> {
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
  return { ok: true, status: data as ProviderStatus };
}

// --- Cal.com (agent-driven scheduling) ---

export type CalcomResult =
  | { ok: true; status: CalcomStatus }
  | { ok: false; error: string };

/** Validate + store the tenant's Cal.com API key and pull their event types. */
export async function connectCalcom(apiKey: string): Promise<CalcomResult> {
  return calcomWrite("POST", { api_key: apiKey });
}

/** Link an event type to one agent — this pair is what turns scheduling on. */
export async function selectCalcomEvent(
  eventTypeId: number,
  agentId: string,
): Promise<CalcomResult> {
  return calcomWrite("PATCH", { event_type_id: eventTypeId, agent_id: agentId });
}

export async function disconnectCalcom(): Promise<CalcomResult> {
  return calcomWrite("DELETE");
}

async function calcomWrite(method: string, body?: unknown): Promise<CalcomResult> {
  let res: Response;
  try {
    res = await fetch("/api/integrations/calcom", {
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
  return { ok: true, status: data as CalcomStatus };
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
