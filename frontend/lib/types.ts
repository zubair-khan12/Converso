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

export type Agent = {
  id: string;
  name: string;
  base_prompt: string;
  voice_id: string | null;
  temperature: number | null;
  first_message: string;
  model: string | null;
  provisioning_status: ProvisioningStatus;
  provisioning_error: string | null;
  vapi_assistant_id: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};
