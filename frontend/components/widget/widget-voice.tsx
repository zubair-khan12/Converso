"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff } from "lucide-react";

import type { WidgetConfig } from "@/lib/types";

type State = "idle" | "connecting" | "active" | "ended" | "error";

// Minimal shape of the parts of the Vapi web client we use.
type VapiClient = {
  start: (assistantId: string) => void;
  stop: () => void;
  setMuted: (muted: boolean) => void;
  on: (event: string, cb: (arg?: unknown) => void) => void;
};

/**
 * The public voice widget: a visitor on the tenant's site talks to their agent
 * through the browser.
 *
 * The call runs on Vapi's *publishable* key, handed over by the widget config
 * endpoint after the origin check — the same key their web SDK expects in a
 * browser. The private key never leaves the server.
 */
export function WidgetVoice({ config }: { config: WidgetConfig }) {
  const [state, setState] = useState<State>("idle");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vapiRef = useRef<VapiClient | null>(null);

  // Hanging up on unmount matters more here than in the dashboard: the visitor
  // may navigate the host page away mid-call, and a live mic left running on
  // someone else's website is the worst version of this bug.
  useEffect(() => () => vapiRef.current?.stop(), []);

  async function start() {
    if (!config.public_key || !config.assistant_id) {
      setState("error");
      setError("This assistant isn't set up for calls yet.");
      return;
    }
    setState("connecting");
    setError(null);
    try {
      const mod = await import("@vapi-ai/web");
      const Vapi = mod.default;
      const vapi = new Vapi(config.public_key) as unknown as VapiClient;
      vapi.on("call-start", () => setState("active"));
      vapi.on("call-end", () => setState("ended"));
      vapi.on("error", () => {
        // Vapi reports a normal hang-up as an error through its transport, so
        // an already-active call ending is not a failure to report.
        setState((prev) => (prev === "active" ? "ended" : "error"));
      });
      vapiRef.current = vapi;
      vapi.start(config.assistant_id);
    } catch {
      setState("error");
      setError("Your browser blocked the call. Check microphone permission.");
    }
  }

  function stop() {
    vapiRef.current?.stop();
    setState("ended");
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    vapiRef.current?.setMuted(next);
  }

  const live = state === "active" || state === "connecting";

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-5 bg-[var(--surface)] p-6 text-center">
      <div>
        <p className="font-[family-name:var(--font-display)] text-base font-bold">
          {config.name}
        </p>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          {state === "connecting" && "Connecting…"}
          {state === "active" && "Connected — go ahead and talk"}
          {state === "ended" && "Call ended"}
          {state === "error" && (error ?? "The call failed")}
          {state === "idle" && "Talk to us right from this page"}
        </p>
      </div>

      {live ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="grid h-12 w-12 place-items-center rounded-full border border-[var(--border)] text-[var(--ink)]"
          >
            {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={stop}
            className="flex h-12 items-center gap-2 rounded-full bg-[var(--danger)] px-5 text-sm font-semibold text-white"
          >
            <PhoneOff className="h-4 w-4" />
            End call
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={start}
          className="flex h-12 items-center gap-2 rounded-full bg-[var(--navy)] px-6 text-sm font-semibold text-white"
        >
          <Phone className="h-4 w-4" />
          {state === "ended" ? "Call again" : "Start call"}
        </button>
      )}
    </div>
  );
}
