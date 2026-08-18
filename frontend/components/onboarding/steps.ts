import {
  BookOpenText,
  Bot,
  CalendarCheck,
  LineChart,
  PhoneCall,
  type LucideIcon,
} from "lucide-react";

export type OnboardingStep = {
  id: string;
  title: string;
  body: string;
  icon: LucideIcon;
};

/** The five things a workspace does, in the order they happen. One sentence
 *  each — this is a tour, not documentation. Deliberately channel-neutral: a
 *  new signup may be here for the website chat and never touch a phone. */
export const STEPS: OnboardingStep[] = [
  {
    id: "agent",
    title: "Create an agent",
    body: "Pick voice or chat, then write how it should greet people.",
    icon: Bot,
  },
  {
    id: "knowledge",
    title: "Add your knowledge",
    body: "Upload your documents so answers come from your business.",
    icon: BookOpenText,
  },
  {
    id: "number",
    title: "Put it live",
    body: "Point a phone number at it, or paste the widget on your website.",
    icon: PhoneCall,
  },
  {
    id: "tools",
    title: "Plug in your tools",
    body: "Let it book meetings and hand off to a human when needed.",
    icon: CalendarCheck,
  },
  {
    id: "insights",
    title: "Review every conversation",
    body: "Recordings, transcripts and summaries land here automatically.",
    icon: LineChart,
  },
];

export const AUTOPLAY_MS = 2000;
