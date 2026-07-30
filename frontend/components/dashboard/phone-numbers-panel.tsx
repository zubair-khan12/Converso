"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  KeyRound,
  Link2,
  Phone,
  PhoneOff,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  connectTelnyx,
  connectTwilio,
  createPhoneNumber,
  deletePhoneNumber,
  detachPhoneNumber,
  reassignPhoneNumber,
  retryPhoneNumber,
} from "@/lib/api";
import type {
  Agent,
  PhoneNumber,
  PhoneNumberStatus,
  ProviderStatus,
  TelephonyProvider,
} from "@/lib/types";

const fieldClass =
  "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const PROVIDER_LABELS: Record<TelephonyProvider, string> = {
  vapi: "Vapi number",
  twilio: "Twilio",
  telnyx: "Telnyx",
};

const STATUS_STYLES: Record<PhoneNumberStatus, string> = {
  ready: "bg-[rgba(107,142,35,0.14)] text-[#4b6115]",
  pending: "bg-[rgba(233,162,59,0.16)] text-[var(--amber-ink)]",
  failed: "bg-red-600/10 text-red-700",
};

const STATUS_LABELS: Record<PhoneNumberStatus, string> = {
  ready: "Live",
  pending: "Provisioning…",
  failed: "Failed",
};

function StatusPill({ status }: { status: PhoneNumberStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </span>
  );
}

function ProviderBadge({ provider }: { provider: TelephonyProvider }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[var(--surface-sunk)] px-2.5 py-1 text-xs font-medium text-[var(--ink-muted)]">
      {PROVIDER_LABELS[provider]}
    </span>
  );
}

function PhoneNumberRow({
  phoneNumber,
  agents,
  onChanged,
}: {
  phoneNumber: PhoneNumber;
  agents: Agent[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<"reassign" | "detach" | "retry" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onReassign(agentId: string) {
    setError(null);
    if (!agentId) {
      setBusy("detach");
      const result = await detachPhoneNumber(phoneNumber.id);
      setBusy(null);
      if (!result.ok) return setError(result.error);
      return onChanged();
    }
    setBusy("reassign");
    const result = await reassignPhoneNumber(phoneNumber.id, agentId);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    onChanged();
  }

  async function onRetry() {
    setError(null);
    setBusy("retry");
    const result = await retryPhoneNumber(phoneNumber.id);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    onChanged();
  }

  async function onDelete() {
    if (!confirm(`Delete ${phoneNumber.e164 ?? "this number"}? This removes it from Vapi too.`)) return;
    setError(null);
    setBusy("delete");
    const result = await deletePhoneNumber(phoneNumber.id);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    onChanged();
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[rgba(244,201,93,0.22)] text-[var(--amber-ink)]">
          <Phone className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold tabular-nums text-[var(--ink)]">
              {phoneNumber.e164 ??
                (phoneNumber.provisioning_status === "failed" ? "No number assigned" : "Provisioning…")}
            </p>
            <StatusPill status={phoneNumber.provisioning_status} />
            <ProviderBadge provider={phoneNumber.provider} />
          </div>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
            {phoneNumber.agent_name ? `Routed to ${phoneNumber.agent_name}` : "Not attached to an agent"}
          </p>
          {phoneNumber.provisioning_status === "failed" && phoneNumber.provisioning_error && (
            <p className="mt-1 text-xs text-red-700">{phoneNumber.provisioning_error}</p>
          )}
          {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <select
          value={phoneNumber.agent_id ?? ""}
          onChange={(e) => onReassign(e.target.value)}
          disabled={busy !== null}
          className={`${fieldClass} h-9 w-auto min-w-[9rem]`}
          aria-label="Attached agent"
        >
          <option value="">— No agent —</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {phoneNumber.provisioning_status === "failed" && (
          <Button size="sm" variant="outline" onClick={onRetry} disabled={busy !== null} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${busy === "retry" ? "animate-spin" : ""}`} />
            Retry
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={onDelete}
          disabled={busy !== null}
          className="gap-1.5 text-red-700 hover:bg-red-600/10 hover:text-red-700"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {busy === "delete" ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </div>
  );
}

function ByoConnectForm({
  provider,
  onConnected,
}: {
  provider: "twilio" | "telnyx";
  onConnected: (status: ProviderStatus) => void;
}) {
  const [sid, setSid] = useState("");
  const [token, setToken] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result =
      provider === "twilio"
        ? await connectTwilio({ account_sid: sid, auth_token: token })
        : await connectTelnyx({ credential_id: credentialId });
    setLoading(false);
    if (!result.ok) return setError(result.error);
    onConnected(result.status);
  }

  return (
    <form className="mt-3 flex flex-col gap-3" onSubmit={onSubmit}>
      <p className="text-xs text-[var(--ink-muted)]">
        {provider === "twilio"
          ? "Buy a number in your Twilio console first, then connect your account here so we can import it."
          : "Buy a number in Telnyx, then add a Telnyx credential at dashboard.vapi.ai/keys (using your Telnyx API key) — paste the UUID Vapi gives you back below. This id comes from Vapi's dashboard, not Telnyx's."}
      </p>
      {provider === "twilio" ? (
        <>
          <Input
            placeholder="Account SID"
            value={sid}
            onChange={(e) => setSid(e.target.value)}
            className="h-9"
            autoComplete="off"
          />
          <Input
            type="password"
            placeholder="Auth Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="h-9"
            autoComplete="off"
          />
        </>
      ) : (
        <Input
          placeholder="Vapi credential UUID (from dashboard.vapi.ai/keys)"
          value={credentialId}
          onChange={(e) => setCredentialId(e.target.value)}
          className="h-9"
          autoComplete="off"
        />
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
      <Button type="submit" size="sm" disabled={loading} className="w-fit gap-1.5">
        <KeyRound className="h-3.5 w-3.5" />
        {loading ? "Connecting…" : `Connect ${PROVIDER_LABELS[provider]}`}
      </Button>
    </form>
  );
}

function AddNumberCard({
  agents,
  twilioStatus,
  telnyxStatus,
  onAdded,
}: {
  agents: Agent[];
  twilioStatus: ProviderStatus;
  telnyxStatus: ProviderStatus;
  onAdded: () => void;
}) {
  const [provider, setProvider] = useState<TelephonyProvider>("vapi");
  const [areaCode, setAreaCode] = useState("");
  const [number, setNumber] = useState("");
  const [agentId, setAgentId] = useState("");
  const [twilio, setTwilio] = useState(twilioStatus);
  const [telnyx, setTelnyx] = useState(telnyxStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providerConnected =
    provider === "vapi" ? true : provider === "twilio" ? twilio.connected : telnyx.connected;

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (provider === "vapi" && !areaCode.trim()) {
      setError("A desired area code is required for a Vapi number (e.g. 415).");
      return;
    }
    setLoading(true);
    const result = await createPhoneNumber({
      provider,
      agent_id: agentId || undefined,
      area_code: provider === "vapi" ? areaCode || undefined : undefined,
      number: provider !== "vapi" ? number || undefined : undefined,
    });
    setLoading(false);
    if (!result.ok) return setError(result.error);
    setAreaCode("");
    setNumber("");
    setAgentId("");
    onAdded();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add a number</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          role="tablist"
          aria-label="Phone number provider"
          className="grid w-full grid-cols-3 gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-sunk)] p-1"
        >
          {(["vapi", "twilio", "telnyx"] as TelephonyProvider[]).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={provider === p}
              onClick={() => setProvider(p)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                provider === p
                  ? "bg-[var(--surface)] font-semibold text-[var(--ink)] shadow-[var(--shadow-sm)]"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              {PROVIDER_LABELS[p]}
            </button>
          ))}
        </div>

        {!providerConnected && provider !== "vapi" ? (
          <ByoConnectForm
            provider={provider}
            onConnected={(status) => (provider === "twilio" ? setTwilio(status) : setTelnyx(status))}
          />
        ) : (
          <form className="mt-4 flex flex-col gap-3" onSubmit={onAdd}>
            {provider === "vapi" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="area-code">Desired area code</Label>
                <Input
                  id="area-code"
                  placeholder="e.g. 415"
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value)}
                  required
                  className="h-9"
                />
                <p className="text-xs text-[var(--ink-muted)]">
                  Vapi requires an area code to pick a number from — it
                  doesn&apos;t hand out just any number.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="byo-number">
                  Your {PROVIDER_LABELS[provider]} number
                </Label>
                <Input
                  id="byo-number"
                  placeholder="+14155551234"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  required
                  className="h-9"
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="attach-agent">Attach to agent (optional)</Label>
              <select
                id="attach-agent"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className={`${fieldClass} h-9`}
              >
                <option value="">— Choose later —</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-xs text-red-700">{error}</p>}

            <Button
              type="submit"
              disabled={loading}
              className="w-fit gap-1.5 bg-gradient-to-br from-[var(--yellow)] to-[var(--amber)] text-[var(--ink)] hover:opacity-95"
            >
              <Plus className="h-4 w-4" />
              {loading ? "Adding…" : provider === "vapi" ? "Get a number" : "Import number"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function PhoneNumbersPanel({
  phoneNumbers,
  agents,
  twilioStatus,
  telnyxStatus,
}: {
  phoneNumbers: PhoneNumber[];
  agents: Agent[];
  twilioStatus: ProviderStatus;
  telnyxStatus: ProviderStatus;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <Card className="order-2 lg:order-1">
        <CardHeader>
          <CardTitle className="text-base">
            Your numbers
            <span className="ml-2 text-sm font-normal text-[var(--ink-muted)]">
              {phoneNumbers.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {phoneNumbers.length === 0 ? (
            <EmptyState
              icon={PhoneOff}
              title="No phone numbers yet"
              body="Add a number to let real callers reach one of your agents."
            />
          ) : (
            <div className="space-y-3">
              {phoneNumbers.map((pn) => (
                <PhoneNumberRow key={pn.id} phoneNumber={pn} agents={agents} onChanged={refresh} />
              ))}
            </div>
          )}
          <p className="mt-4 flex items-center gap-1.5 text-xs text-[var(--ink-muted)]">
            <Link2 className="h-3.5 w-3.5" />
            Attaching a number routes every inbound call on it straight to that
            agent — the same way your web test calls work, just from a real phone.
          </p>
        </CardContent>
      </Card>

      <div className="order-1 lg:order-2">
        <AddNumberCard
          agents={agents}
          twilioStatus={twilioStatus}
          telnyxStatus={telnyxStatus}
          onAdded={refresh}
        />
      </div>
    </div>
  );
}
