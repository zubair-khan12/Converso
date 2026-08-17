import {
  Blocks,
  BookOpen,
  Bot,
  KeyRound,
  LayoutDashboard,
  Phone,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Not built yet — shown but not navigable. */
  soon?: boolean;
  /** Built, but stays locked until the tenant has connected Vapi. */
  requiresVapi?: boolean;
};

export type NavSection = {
  /** Grouping label. Omitted for the first group, which needs no heading. */
  title?: string;
  items: NavItem[];
};

/**
 * Grouped by what you're doing, not by the order things were built: whatever
 * shapes what an agent *says* sits under Build, whatever concerns reaching it
 * by phone sits under Telephony. The groups also stop the sidebar reading as
 * eight equally-weighted choices.
 */
export const NAV: NavSection[] = [
  {
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Build",
    items: [
      { label: "Agents", href: "/dashboard/agents", icon: Bot, requiresVapi: true },
      {
        label: "Knowledge Base",
        href: "/dashboard/knowledge",
        icon: BookOpen,
        requiresVapi: true,
      },
      {
        label: "Integrations",
        href: "/dashboard/integrations",
        icon: Blocks,
        requiresVapi: true,
      },
    ],
  },
  {
    title: "Telephony",
    items: [
      { label: "Configure Vapi", href: "/dashboard/vapi-setup", icon: KeyRound },
      {
        label: "Phone Numbers",
        href: "/dashboard/phone-numbers",
        icon: Phone,
        requiresVapi: true,
      },
      {
        label: "Call Logs",
        href: "/dashboard/call-logs",
        icon: ScrollText,
        requiresVapi: true,
      },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Settings", href: "/dashboard/settings", icon: Settings, soon: true },
    ],
  },
];
