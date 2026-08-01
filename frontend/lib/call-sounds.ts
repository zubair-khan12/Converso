// Call UX sounds, synthesized with the Web Audio API so there are no audio
// files to bundle and it works offline. Used by the web test-call overlay:
//   - a looping ringback tone while the call is connecting ("it's dialing")
//   - a short descending tone when the call ends ("call over")
//
// The overlay is opened by a user click, so the AudioContext has activation.
// All methods are no-ops if Web Audio isn't available.

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: AudioContextCtor })
      .webkitAudioContext ||
    null
  );
}

export class CallSounds {
  private ctx: AudioContext | null = null;
  private ringTimer: ReturnType<typeof setInterval> | null = null;
  private ringGain: GainNode | null = null;
  private ringOscillators: OscillatorNode[] = [];

  private ensureCtx(): AudioContext | null {
    if (!this.ctx) {
      const Ctor = getAudioContextCtor();
      if (!Ctor) return null;
      try {
        this.ctx = new Ctor();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Start the looping ringback (US-style dual 440+480 Hz, ~2s on / ~2s off). */
  startRingback(): void {
    const ctx = this.ensureCtx();
    if (!ctx || this.ringGain) return;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(ctx.destination);

    this.ringOscillators = [440, 480].map((freq) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start();
      return osc;
    });
    this.ringGain = gain;

    const ring = () => {
      if (!this.ctx || !this.ringGain) return;
      const t = this.ctx.currentTime;
      const g = this.ringGain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(0.11, t + 0.05); // attack
      g.setValueAtTime(0.11, t + 1.9); // hold the ring
      g.exponentialRampToValueAtTime(0.0001, t + 2.0); // release
    };
    ring(); // ring immediately so there's no silent gap on connect
    this.ringTimer = setInterval(ring, 4000);
  }

  /** Stop the ringback (call connected, failed, or ended). */
  stopRingback(): void {
    if (this.ringTimer !== null) {
      clearInterval(this.ringTimer);
      this.ringTimer = null;
    }
    const gain = this.ringGain;
    const oscs = this.ringOscillators;
    this.ringGain = null;
    this.ringOscillators = [];
    if (gain && this.ctx) {
      const t = this.ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    }
    setTimeout(() => {
      oscs.forEach((o) => {
        try {
          o.stop();
          o.disconnect();
        } catch {
          /* already stopped */
        }
      });
      try {
        gain?.disconnect();
      } catch {
        /* noop */
      }
    }, 120);
  }

  /** Play a short descending "call ended" tone (480 → 400 Hz). */
  playEndTone(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.connect(gain);

    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(480, t);
    osc.frequency.setValueAtTime(400, t + 0.18);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.13, t + 0.03);
    gain.gain.setValueAtTime(0.13, t + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.start(t);
    osc.stop(t + 0.42);
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* noop */
      }
    };
  }

  /** Release the audio context. Delayed so a just-played end tone can finish. */
  dispose(): void {
    this.stopRingback();
    const ctx = this.ctx;
    this.ctx = null;
    setTimeout(() => {
      try {
        void ctx?.close();
      } catch {
        /* noop */
      }
    }, 600);
  }
}
