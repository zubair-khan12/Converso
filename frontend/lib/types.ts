// Shared types used across client and server.

export type SessionUser = {
  id: string;
  email: string;
  tenant_id: string;
  role: string;
  name?: string | null;
  /** False until the user has been through the getting-started tour once. */
  onboarded: boolean;
};

export type VapiStatus = {
  connected: boolean;
  masked_key: string | null;
  has_public_key: boolean;
};

export type CallCredentials = {
  public_key: string;
  assistant_id: string;
  name: string;
};

export type Voice = {
  voiceId: string;
  name: string;
  gender: string;
  accent: string;
};

export type ProvisioningStatus = "pending" | "ready" | "failed";

/** A knowledge source's lifecycle: uploaded → embedded on "Train agent". */
export type DocumentStatus = "pending" | "processing" | "ready" | "failed";

export type KnowledgeDocument = {
  id: string;
  agent_id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  status: DocumentStatus;
  error: string | null;
  chunk_count: number;
  created_at: string | null;
};

/** Result of a "Train agent" run — how many sources were embedded. */
export type TrainingSummary = {
  documents_total: number;
  documents_trained: number;
  documents_failed: number;
  chunks: number;
};

export type TelephonyProvider = "vapi" | "twilio" | "telnyx";

/** A phone number's lifecycle: created locally, provisioned on Vapi, or failed. */
export type PhoneNumberStatus = "pending" | "ready" | "failed";

export type PhoneNumber = {
  id: string;
  provider: TelephonyProvider;
  e164: string | null;
  agent_id: string | null;
  agent_name: string | null;
  provisioning_status: PhoneNumberStatus;
  provisioning_error: string | null;
  is_active: boolean;
  created_at: string | null;
};

/** Connection status for a bring-your-own telephony provider (Twilio/Telnyx) —
 *  simpler than VapiStatus since there's no separate public key. */
export type ProviderStatus = {
  connected: boolean;
  masked_key: string | null;
};

/** A bookable event type on the tenant's Cal.com account. */
export type CalcomEventType = {
  id: number;
  title: string;
  slug: string | null;
  length_minutes: number | null;
};

export type CalcomStatus = {
  connected: boolean;
  masked_key: string | null;
  /** The Cal.com account meetings are booked under. */
  organizer_email: string | null;
  /** The account's own timezone — the agent speaks in it. */
  time_zone: string | null;
  event_types: CalcomEventType[];
  /** Which event gets booked. Null until one is picked. */
  event_type_id: number | null;
  event_title: string | null;
  length_minutes: number | null;
  /** The one agent that can book. Only this agent gets the scheduling tools —
   *  an event type and an agent together are what turn scheduling on. */
  agent_id: string | null;
  agent_name: string | null;
  /** The ready-to-paste base-prompt snippet, or null until both are chosen. */
  scheduling_prompt: string | null;
};

export type Agent = {
  id: string;
  name: string;
  base_prompt: string;
  voice_id: string | null;
  temperature: number | null;
  first_message: string;
  model: string | null;
  /** True once the agent has an embedded knowledge base (routes via RAG brain). */
  knowledge_trained: boolean;
  provisioning_status: ProvisioningStatus;
  provisioning_error: string | null;
  vapi_assistant_id: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};
