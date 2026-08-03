import Link from "next/link";

import { LogoMark } from "@/components/brand/logo";
import styles from "./page.module.css";

const services = [
  {
    id: "agents",
    label: "Voice Agents",
    title: "Design an agent in minutes",
    body: "Give it a name, a voice, and a personality. It answers the phone the way your best rep would.",
    accent: "amber",
  },
  {
    id: "knowledge",
    label: "Knowledge Base",
    title: "It actually knows your business",
    body: "Upload your docs and price lists. Answers are grounded in your content — no made-up facts.",
    accent: "olive",
  },
  {
    id: "telephony",
    label: "Phone Numbers",
    title: "A real number, live in one click",
    body: "Attach a phone number and your agent is reachable. Calls route straight to the right agent.",
    accent: "yellow",
  },
  {
    id: "booking",
    label: "Meeting Booking",
    title: "Turns calls into calendar events",
    body: "When a caller wants to talk, the agent books the meeting on your calendar before hanging up.",
    accent: "amber",
  },
];

// Deterministic bar heights so server + client render the same waveform.
const WAVE = [28, 46, 70, 52, 88, 40, 64, 100, 58, 34, 76, 48, 92, 60, 30, 54,
  82, 44, 68, 96, 50, 36, 72, 56, 84, 42, 62, 100, 38, 66, 48, 78];

export default function Home() {
  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand} aria-label="Converso home">
          <LogoMark className={styles.brandMark} />
          converso
        </Link>
        <Link href="/login" className={styles.navSignIn}>
          Sign in
        </Link>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Voice AI, without the engineering team</p>
        <h1 className={styles.headline}>
          Give your business a voice that <em>answers</em>.
        </h1>
        <p className={styles.sub}>
          Converso builds AI phone agents that know your business, talk like a
          human, and book the meeting — so no call goes unanswered.
        </p>

        <div className={styles.ctaRow}>
          <Link href="/login" className={styles.ctaPrimary}>
            Get started
            <span className={styles.arrow} aria-hidden>
              →
            </span>
          </Link>
          <Link href="/login" className={styles.ctaGhost}>
            Sign in
          </Link>
        </div>

        <div className={styles.wave} aria-hidden>
          {WAVE.map((h, i) => (
            <span
              key={i}
              className={styles.waveBar}
              style={{ height: `${h}%`, animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
      </section>

      <section className={styles.services} id="services">
        <div className={styles.servicesHead}>
          <h2 className={styles.servicesTitle}>Everything one call needs</h2>
          <p className={styles.servicesSub}>
            Four building blocks. Click any of them to get started.
          </p>
        </div>

        <div className={styles.grid}>
          {services.map((s) => (
            <Link
              key={s.id}
              href="/login"
              className={styles.card}
              data-accent={s.accent}
            >
              <span className={styles.cardLabel}>{s.label}</span>
              <h3 className={styles.cardTitle}>{s.title}</h3>
              <p className={styles.cardBody}>{s.body}</p>
              <span className={styles.cardCta}>
                Start
                <span aria-hidden>→</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} Converso</span>
        <Link href="/login" className={styles.footerLink}>
          Sign in →
        </Link>
      </footer>
    </main>
  );
}
