// Shared types used across client and server.

export type SessionUser = {
  id: string;
  email: string;
  tenant_id: string;
  role: string;
  name?: string | null;
  /** False until the user has been through the getting-started tour once.
   *  Only self-signups start false — provisioned users skip the tour. */
  onboarded: boolean;
  /** The organization (tenant) this user belongs to. */
  organization?: string | null;
  /** Whether the organization may use the product. False once staff disable
   *  the account — the user can still sign in, but sees the locked screen. */
  account_enabled: boolean;
  /** Customer-facing explanation of the lock, or null when enabled. */
  account_locked_reason?: string | null;
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

/** One row in the call log. `duration_seconds` and `ended_reason` only exist
 *  once Vapi's end-of-call report has arrived. */
export type CallLogEntry = {
  id: string;
  agent_name: string | null;
  caller_number: string | null;
  direction: "inbound" | "outbound" | "web";
  status: "active" | "completed" | "failed";
  ended_reason: string | null;
  duration_seconds: number | null;
  started_at: string | null;
};

/** Rollups behind the dashboard home. Counts are always real numbers — the
 *  whole object is null when the backend is unreachable. */
export type DashboardSummary = {
  agents: { total: number; ready: number };
  phone_numbers: { total: number; attached: number };
  documents: { total: number; ready: number };
  calls: {
    total: number;
    this_month: number;
    last_7_days: number;
    in_progress: number;
    failed: number;
  };
  minutes: { total: number; this_month: number };
  unique_callers: number;
  avg_duration_seconds: number;
  total_cost_usd: number;
  recent_calls: CallLogEntry[];
};

/** A call as the Call Logs list shows it. Extends the dashboard's compact
 *  entry with what playback and detail-fetching need. */
export type CallLog = CallLogEntry & {
  agent_id: string | null;
  cost_usd: number | null;
  recording_url: string | null;
  ended_at: string | null;
};

export type CallLogPage = {
  calls: CallLog[];
  total: number;
  has_more: boolean;
};

/** One turn of a call, as reconstructed from Vapi's end-of-call report. */
export type CallMessage = {
  role: string;
  content: string | null;
  seq: number;
};

/** A tool the agent ran mid-call — a knowledge lookup or a Cal.com booking. */
export type CallToolExecution = {
  tool_name: string;
  status: string;
  latency_ms: number | null;
  input: unknown;
  output: unknown;
};

export type CallLogDetail = CallLog & {
  summary: string | null;
  transcript: string | null;
  messages: CallMessage[];
  tool_executions: CallToolExecution[];
};
