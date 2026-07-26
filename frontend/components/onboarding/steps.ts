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
 *  each — this is a tour, not documentation. */
export const STEPS: OnboardingStep[] = [
  {
    id: "agent",
    title: "Create an agent",
    body: "Name it, pick a voice, and write how it should greet callers.",
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
    title: "Connect a number",
    body: "Point a phone number at the agent and it starts answering.",
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
    title: "Review every call",
    body: "Transcripts and summaries land here after each conversation.",
    icon: LineChart,
  },
];

export const AUTOPLAY_MS = 2000;
