"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AUTOPLAY_MS, STEPS } from "@/components/onboarding/steps";

export function GettingStarted({ firstName }: { firstName: string }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  // Autoplay is the default; hovering, focusing or dragging the deck holds it.
  const [playing, setPlaying] = useState(true);
  const [held, setHeld] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const dragStart = useRef<number | null>(null);

  const running = playing && !held && !leaving;

  const goTo = useCallback((next: number) => {
    setIndex(((next % STEPS.length) + STEPS.length) % STEPS.length);
  }, []);
  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  // Auto-swipe. The timer restarts whenever the slide changes, so a manual
  // swipe always gets a full window before the deck moves on its own.
  useEffect(() => {
    if (!running) return;
    const id = setTimeout(() => goTo(index + 1), AUTOPLAY_MS);
    return () => clearTimeout(id);
  }, [running, index, goTo]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  /** Mark the tour as seen so it never shows again, then head to the app.
   *  A failed write shouldn't trap anyone here, so we navigate regardless. */
  async function finish() {
    if (leaving) return;
    setLeaving(true);
    await fetch("/api/auth/onboarded", { method: "POST" }).catch(() => {});
    router.push("/dashboard");
    router.refresh();
  }

  function onPointerDown(e: React.PointerEvent) {
    dragStart.current = e.clientX;
    setHeld(true);
  }
  function onPointerUp(e: React.PointerEvent) {
    const start = dragStart.current;
    dragStart.current = null;
    setHeld(false);
    if (start === null) return;
    const dx = e.clientX - start;
    if (Math.abs(dx) > 45) (dx < 0 ? next : prev)();
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center bg-[radial-gradient(60%_45%_at_50%_0%,rgba(244,201,93,0.26),transparent_72%)] px-5 py-7 sm:px-8">
      {/* Brand pinned to the true page corner; Skip mirrors it on the right. */}
      <span className="absolute left-5 top-7 flex items-center gap-2.5 font-[family-name:var(--font-display)] text-base font-bold tracking-tight sm:left-8">
        <span
          aria-hidden
          className="h-4 w-4 rounded-md bg-gradient-to-br from-[var(--yellow)] to-[var(--amber)] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.4)]"
        />
        Converso
      </span>
      <button
        type="button"
        onClick={finish}
        className="absolute right-5 top-6 rounded-lg px-2.5 py-1.5 text-sm font-medium text-[var(--ink-muted)] transition-colors hover:bg-[rgba(31,41,55,0.06)] hover:text-[var(--ink)] sm:right-8"
      >
        Skip
      </button>

      <div className="flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 py-16">
        <h1 className="text-center font-[family-name:var(--font-display)] text-[1.6rem] font-bold tracking-tight text-balance">
          Welcome, {firstName}
        </h1>

        <section
          aria-roledescription="carousel"
          aria-label="Getting started with Converso"
          className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
          onMouseEnter={() => setHeld(true)}
          onMouseLeave={() => setHeld(false)}
          onFocusCapture={() => setHeld(true)}
          onBlurCapture={() => setHeld(false)}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            dragStart.current = null;
            setHeld(false);
          }}
        >
          {/* Every slide is the same fixed box, so nothing reflows between
              steps however long the copy is. */}
          <div className="overflow-hidden">
            <div
              className="flex transition-transform duration-500 ease-[cubic-bezier(0.22,0.61,0.36,1)]"
              style={{ transform: `translateX(-${index * 100}%)` }}
            >
              {STEPS.map((step, i) => {
                const Icon = step.icon;
                const active = i === index;
                return (
                  <article
                    key={step.id}
                    aria-hidden={!active}
                    className="flex h-[340px] w-full shrink-0 select-none flex-col items-center justify-center gap-6 px-10 text-center"
                  >
                    <span
                      className={[
                        "grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-[var(--yellow)] to-[var(--amber)] text-[var(--amber-ink)] shadow-[var(--shadow-md)] transition-all duration-500",
                        active ? "scale-100 opacity-100" : "scale-90 opacity-0",
                      ].join(" ")}
                    >
                      <Icon className="h-9 w-9" strokeWidth={1.9} />
                    </span>

                    <div
                      className={[
                        "transition-all duration-500",
                        active
                          ? "translate-y-0 opacity-100"
                          : "translate-y-2 opacity-0",
                      ].join(" ")}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--amber-ink)] tabular-nums">
                        Step {i + 1} of {STEPS.length}
                      </p>
                      <h2 className="mt-3 font-[family-name:var(--font-display)] text-[1.85rem] font-bold tracking-tight">
                        {step.title}
                      </h2>
                      <p className="mx-auto mt-2.5 max-w-[38ch] text-[1.05rem] text-[var(--ink-muted)] text-balance">
                        {step.body}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          {/* Controls. The rail doubles as the autoplay timer. */}
          <div className="flex items-center gap-2.5 border-t border-[var(--border)] px-4 py-3">
            <button
              type="button"
              onClick={prev}
              aria-label="Previous step"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-sunk)] hover:text-[var(--ink)]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <ol className="flex flex-1 items-center gap-1.5">
              {STEPS.map((step, i) => {
                const active = i === index;
                return (
                  <li key={step.id} className="flex-1">
                    <button
                      type="button"
                      onClick={() => goTo(i)}
                      aria-label={`Go to step ${i + 1}: ${step.title}`}
                      aria-current={active ? "step" : undefined}
                      className="group flex w-full items-center py-2"
                    >
                      <span className="relative h-1 w-full overflow-hidden rounded-full bg-[var(--surface-sunk)] transition-colors group-hover:bg-[rgba(31,41,55,0.14)]">
                        <span
                          key={`${i}-${index}-${running}`}
                          className="absolute inset-0 origin-left rounded-full bg-[var(--amber)]"
                          style={
                            active
                              ? {
                                  animation: `converso-progress ${AUTOPLAY_MS}ms linear forwards`,
                                  animationPlayState: running
                                    ? "running"
                                    : "paused",
                                }
                              : {
                                  transform: `scaleX(${i < index ? 1 : 0})`,
                                  opacity: i < index ? 0.4 : 0,
                                }
                          }
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause auto-advance" : "Resume auto-advance"}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-sunk)] hover:text-[var(--ink)]"
            >
              {playing ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next step"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-sunk)] hover:text-[var(--ink)]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        <Button
          onClick={finish}
          disabled={leaving}
          className="h-11 w-full gap-1.5 bg-gradient-to-br from-[var(--yellow)] to-[var(--amber)] text-[0.95rem] text-[var(--ink)] hover:opacity-95"
        >
          {leaving ? "Opening…" : "Go to dashboard"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </main>
  );
}
