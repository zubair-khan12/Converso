import Link from "next/link";

import { LogoMark } from "@/components/brand/logo";
import styles from "./page.module.css";

/* One agent, two channels — which is the product's actual shape, so the page
   leads with it rather than listing chat as a fifth feature bolted on. */
const services = [
  {
    id: "agents",
    label: "Voice + Chat",
    title: "One agent, on the phone and on your site",
    body: "Build it once. The same agent answers your phone and the chat bubble on your website — same knowledge, same booking, one place to change it.",
    accent: "amber",
  },
  {
    id: "knowledge",
    label: "Knowledge Base",
    title: "It actually knows your business",
    body: "Upload your docs and price lists. Answers are grounded in your content — no made-up facts, on either channel.",
    accent: "olive",
  },
  {
    id: "telephony",
    label: "Phone + Widget",
    title: "Live in one click, either way",
    body: "Attach a real phone number, or paste one line of HTML on your site. No engineering either way.",
    accent: "yellow",
  },
  {
    id: "booking",
    label: "Meeting Booking",
    title: "Turns conversations into calendar events",
    body: "Whether they called or typed, the agent checks your real availability and books the meeting before the conversation ends.",
    accent: "amber",
  },
];

/* Sequential on purpose — you can't ground an agent before it exists, or put
   it live before it can answer. The numbering says that; it isn't decoration. */
const STEPS = [
  {
    title: "Build the agent",
    body: "Name it, write how it should behave, pick a voice if it answers the phone. Two minutes, no code.",
  },
  {
    title: "Give it your knowledge",
    body: "Upload PDFs or paste your text. It answers from your content and says so honestly when something isn't covered.",
  },
  {
    title: "Put it live",
    body: "Attach a phone number, paste the widget on your site, or both. The same agent handles either.",
  },
  {
    title: "Let it book",
    body: "Connect Cal.com and it checks your real availability, then books the meeting while the customer is still there.",
  },
];

const FAQ = [
  {
    q: "Do I need both channels?",
    a: "No. Run just the phone agent, just the website chat, or both. They're the same agent underneath, so adding the second one later costs you nothing to set up again.",
  },
  {
    q: "Will it make things up?",
    a: "It answers from the documents you give it, and it's told to say it doesn't know rather than guess. Every answer records which of your documents it came from, so you can check.",
  },
  {
    q: "What do I need before I start?",
    a: "For chat on your website, nothing but an account. For phone calls you connect your own Vapi account, so the calls and the number stay yours.",
  },
  {
    q: "Can I see what it actually said?",
    a: "Every call and every chat is saved with a full transcript, the recording for calls, and a trace of what the agent looked up mid-conversation.",
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
        <nav className={styles.navActions}>
          <Link href="/login" className={styles.navSignIn}>
            Sign in
          </Link>
          <Link href="/signup" className={styles.navSignUp}>
            Get started
          </Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>AI agents, without the engineering team</p>
        <h1 className={styles.headline}>
          Never miss a customer who <em>calls</em> — or <em>types</em>.
        </h1>
        <p className={styles.sub}>
          Converso builds AI agents that know your business, answer the phone
          and the chat on your website, and book the meeting — so nothing goes
          unanswered while you&apos;re busy.
        </p>

        <div className={styles.ctaRow}>
          <Link href="/signup" className={styles.ctaPrimary}>
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
          <h2 className={styles.servicesTitle}>
            Everything one conversation needs
          </h2>
          <p className={styles.servicesSub}>
            Four building blocks, shared by both channels. Click any of them to
            get started.
          </p>
        </div>

        <div className={styles.grid}>
          {services.map((s) => (
            <Link
              key={s.id}
              href="/signup"
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

      <section className={styles.steps}>
        <div className={styles.servicesHead}>
          <h2 className={styles.servicesTitle}>Live by this afternoon</h2>
          <p className={styles.servicesSub}>
            Four steps, in order. Most people are answering real questions after
            the second one.
          </p>
        </div>
        <ol className={styles.stepGrid}>
          {STEPS.map((step) => (
            <li key={step.title} className={styles.step}>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepBody}>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.channels}>
        <div className={`${styles.channel} ${styles.channelDark}`}>
          <p className={styles.channelKicker}>On the phone</p>
          <h2 className={styles.channelTitle}>It answers when you can&apos;t</h2>
          <p className={styles.channelBody}>
            A real number your customers can ring. The agent picks up on the
            first ring, at 2am, on a bank holiday, while you&apos;re on the other
            line.
          </p>
          <ul className={styles.channelList}>
            <li>
              <span className={styles.tick} aria-hidden>
                ✓
              </span>
              Natural voices, not a phone menu
            </li>
            <li>
              <span className={styles.tick} aria-hidden>
                ✓
              </span>
              Recording and transcript of every call
            </li>
            <li>
              <span className={styles.tick} aria-hidden>
                ✓
              </span>
              Your own Vapi account — the number stays yours
            </li>
          </ul>
        </div>

        <div className={styles.channel}>
          <p className={styles.channelKicker}>On your website</p>
          <h2 className={styles.channelTitle}>One line of HTML</h2>
          <p className={styles.channelBody}>
            Paste the snippet and a chat bubble appears on your site, answering
            from the same knowledge and booking into the same calendar.
          </p>
          <div className={styles.snippet}>
            {'<script src="…/widget.js" data-agent="…"></script>'}
          </div>
          <ul className={styles.channelList}>
            <li>
              <span className={styles.tick} aria-hidden>
                ✓
              </span>
              Works on any site — no plugin, no framework
            </li>
            <li>
              <span className={styles.tick} aria-hidden>
                ✓
              </span>
              You choose which domains may run it
            </li>
            <li>
              <span className={styles.tick} aria-hidden>
                ✓
              </span>
              No Vapi account needed for chat
            </li>
          </ul>
        </div>
      </section>

      <section className={styles.faq}>
        <div className={styles.servicesHead}>
          <h2 className={styles.servicesTitle}>Straight answers</h2>
        </div>
        <div className={styles.faqList}>
          {FAQ.map((item) => (
            <div key={item.q}>
              <h3 className={styles.faqQ}>{item.q}</h3>
              <p className={styles.faqA}>{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.closer}>
        <h2 className={styles.closerTitle}>
          Every missed call is someone who called a competitor
        </h2>
        <p className={styles.closerSub}>
          Set up an agent, give it your documents, and see what it says. You can
          test it yourself before anyone else ever reaches it.
        </p>
        <Link href="/signup" className={styles.closerCta}>
          Get started
          <span aria-hidden>→</span>
        </Link>
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
