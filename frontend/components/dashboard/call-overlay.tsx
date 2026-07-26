"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, X } from "lucide-react";

import { getCallCredentials } from "@/lib/api";
import { CallSounds } from "@/lib/call-sounds";
import type { Agent } from "@/lib/types";

// Daily (Vapi's WebRTC transport) logs a benign "Meeting ended due to ejection"
// error on every normal hang-up. It fires as the meeting tears down — often
// just after our overlay unmounts — so it can't be filtered per-instance.
// Install a one-time, exact-match filter that drops only that line and passes
// everything else through untouched.
if (typeof window !== "undefined") {
  const w = window as unknown as { __conversoEjectionFilter?: boolean };
  if (!w.__conversoEjectionFilter) {
    w.__conversoEjectionFilter = true;
    const isEjectionNoise = (args: unknown[]) =>
      typeof args[0] === "string" &&
      args[0].includes("Meeting ended due to ejection");
    for (const level of ["error", "warn"] as const) {
      const original = console[level].bind(console);
      console[level] = (...args: unknown[]) => {
        if (!isEjectionNoise(args)) original(...args);
      };
    }
  }
}

type CallState = "connecting" | "active" | "ended" | "error";

// Minimal shape of the parts of the Vapi web client we use.
type VapiClient = {
  start: (assistantId: string) => void;
  stop: () => void;
  setMuted: (muted: boolean) => void;
  on: (event: string, cb: (arg?: unknown) => void) => void;
};

/** True for Vapi's normal end-of-call signal, which the transport (Daily)
 *  reports as an "ejected" / "Meeting has ended" error — not a real failure. */
function isBenignEnd(e: unknown): boolean {
  const raw = extractMessage(e).toLowerCase();
  return (
    raw.includes("meeting has ended") ||
    raw.includes("meeting ended") ||
    raw.includes("ejected") ||
    raw.includes("ejection")
  );
}

/** Pull a human-readable reason out of Vapi's error event, which may be an
 *  Error, a DOM error, a plain object, or a string. */
function describeVapiError(e: unknown): string {
  const raw = extractMessage(e).toLowerCase();

  if (raw.includes("permission") || raw.includes("notallowed") || raw.includes("denied")) {
    return "Microphone access was blocked. Allow the mic for this site and try again.";
  }
  if (raw.includes("notfound") || raw.includes("no device") || raw.includes("requested device")) {
    return "No microphone found. Connect one and try again.";
  }
  if (raw.includes("401") || raw.includes("unauthor") || raw.includes("forbidden") || raw.includes("invalid")) {
    return "Vapi rejected the call. Your public key is likely from a different Vapi account than the private key that created this agent — both keys must be from the same account.";
  }
  const msg = extractMessage(e);
  return msg ? `Call failed: ${msg}` : "The call failed to connect. Check your mic permission and that both Vapi keys are from the same account.";
}

function extractMessage(e: unknown): string {
  if (!e) return "";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (typeof e === "object") {
    const o = e as Record<string, unknown>;
    const nested =
      (o.error as Record<string, unknown> | undefined) ??
      (o.errorMsg as unknown) ??
      o.message ??
      o.msg ??
      o.type;
    if (typeof nested === "string") return nested;
    if (nested && typeof nested === "object") {
      const n = nested as Record<string, unknown>;
      if (typeof n.message === "string") return n.message;
    }
    try {
      return JSON.stringify(e);
    } catch {
      return "";
    }
  }
  return String(e);
}

export function CallOverlay({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [state, setState] = useState<CallState>("connecting");
  const [status, setStatus] = useState("Calling…");
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const vapiRef = useRef<VapiClient | null>(null);
  const soundsRef = useRef<CallSounds | null>(null);
  const closedRef = useRef(false);
  // Keep a live ref to onClose so the effect can stay keyed only on the agent
  // and not re-run (restarting the call) when the parent re-renders.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Tear down the call and dismiss the overlay. Idempotent — the transport
  // can fire both call-end and an "ejected" error for a single hang-up.
  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    // Audible "call over" cue, then dismiss. The end tone plays on the same
    // audio context, which dispose() closes only after the tone has finished.
    soundsRef.current?.stopRingback();
    soundsRef.current?.playEndTone();
    try {
      vapiRef.current?.stop();
    } catch {
      /* already stopped */
    }
    onCloseRef.current();
  }, []);

  useEffect(() => {
    let cancelled = false;
    document.body.style.overflow = "hidden";

    // Start the ringback immediately so the call feels like it's dialing while
    // credentials load and the transport connects.
    const sounds = new CallSounds();
    soundsRef.current = sounds;
    sounds.startRingback();

    async function begin() {
      const creds = await getCallCredentials(agent.id);
      if (cancelled) return;
      if (!creds.ok) {
        sounds.stopRingback();
        setState("error");
        setError(creds.error);
        return;
      }

      let vapi: VapiClient;
      try {
        const mod = await import("@vapi-ai/web");
        if (cancelled) return;
        const Vapi = mod.default;
        vapi = new Vapi(creds.credentials.public_key) as unknown as VapiClient;
      } catch {
        sounds.stopRingback();
        setState("error");
        setError("Could not load the voice client.");
        return;
      }
      vapiRef.current = vapi;

      vapi.on("call-start", () => {
        if (cancelled) return;
        // Connected — stop dialing.
        sounds.stopRingback();
        setState("active");
        setStatus("Listening…");
      });
      // Any end of the call — the caller hangs up, or the agent ends it on
      // request — dismisses the overlay right away.
      vapi.on("call-end", () => close());
      vapi.on("speech-start", () => {
        if (cancelled) return;
        setSpeaking(true);
        setStatus(`${agent.name} is speaking…`);
      });
      vapi.on("speech-end", () => {
        if (cancelled) return;
        setSpeaking(false);
        setStatus("Listening…");
      });
      vapi.on("volume-level", (v) => {
        if (!cancelled) setVolume(typeof v === "number" ? v : 0);
      });
      vapi.on("error", (e) => {
        // The transport reports a normal hang-up as an "ejected" error — that's
        // not a failure, so just close quietly.
        if (isBenignEnd(e)) {
          close();
          return;
        }
        // eslint-disable-next-line no-console
        console.error("Vapi call error:", e);
        if (cancelled) return;
        sounds.stopRingback();
        setState("error");
        setError(describeVapiError(e));
      });

      try {
        vapi.start(creds.credentials.assistant_id);
      } catch {
        sounds.stopRingback();
        setState("error");
        setError("Could not start the call.");
      }
    }

    begin();

    return () => {
      cancelled = true;
      document.body.style.overflow = "";
      try {
        vapiRef.current?.stop();
      } catch {
        /* already stopped */
      }
      // Delayed context close — lets an in-flight end tone finish.
      sounds.dispose();
    };
  }, [agent.id, agent.name, close]);

  function endCall() {
    close();
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    vapiRef.current?.setMuted(next);
  }

  const initial = agent.name.trim().charAt(0).toUpperCase() || "A";
  // Orb grows a little with the current audio volume for a "live" feel.
  const orbScale = state === "active" ? 1 + Math.min(volume, 1) * 0.22 : 1;
  const canEndByOrb = state === "active" || state === "connecting";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Test call with ${agent.name}`}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-10 bg-[#1f2937]/95 px-6 backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={endCall}
        aria-label="Close"
        className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="text-center">
        <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-white">
          {agent.name}
        </p>
        <p className="mt-1 text-sm text-white/60">Web test call</p>
      </div>

      {/* The orb. Clicking it ends the call. */}
      <button
        type="button"
        onClick={canEndByOrb ? endCall : undefined}
        disabled={!canEndByOrb}
        aria-label="End call"
        title={canEndByOrb ? "Click to end the call" : undefined}
        className="group relative grid h-56 w-56 place-items-center rounded-full outline-none"
      >
        {/* Pulsing rings while the agent speaks */}
        {speaking && (
          <>
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--amber)]/30 [animation-duration:1.4s]" />
            <span className="absolute inset-4 animate-ping rounded-full bg-[var(--amber)]/20 [animation-duration:1.8s]" />
          </>
        )}

        {/* Core */}
        <span
          className="relative grid h-44 w-44 place-items-center rounded-full bg-gradient-to-br from-[var(--yellow)] to-[var(--amber)] shadow-[0_0_60px_-8px_rgba(233,162,59,0.6)] transition-transform duration-150 ease-out group-hover:from-red-400 group-hover:to-red-500"
          style={{ transform: `scale(${orbScale})` }}
        >
          <span className="font-[family-name:var(--font-display)] text-5xl font-bold text-[var(--amber-ink)] group-hover:hidden">
            {initial}
          </span>
          <span className="hidden flex-col items-center gap-1 text-white group-hover:flex">
            <PhoneOff className="h-8 w-8" />
            <span className="text-xs font-semibold">End</span>
          </span>
        </span>
      </button>

      {/* Status / error */}
      <div className="flex min-h-[3rem] flex-col items-center gap-1 text-center">
        {state === "error" ? (
          <p className="max-w-sm text-sm text-red-300">{error}</p>
        ) : (
          <>
            <p className="text-lg font-medium text-white">{status}</p>
            {state === "active" && (
              <p className="text-xs text-white/50">Tap the circle to hang up</p>
            )}
          </>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        {state === "active" && (
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
        )}
        <button
          type="button"
          onClick={endCall}
          className="flex items-center gap-2 rounded-full bg-red-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-600"
        >
          <PhoneOff className="h-4 w-4" />
          {state === "ended" ? "Close" : "End call"}
        </button>
      </div>
    </div>
  );
}
