import {
  Blocks,
  BookOpen,
  Bot,
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
};

export const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Agents", href: "/dashboard/agents", icon: Bot, soon: true },
  { label: "Knowledge Base", href: "/dashboard/knowledge", icon: BookOpen, soon: true },
  { label: "Phone Numbers", href: "/dashboard/phone-numbers", icon: Phone, soon: true },
  { label: "Call Logs", href: "/dashboard/call-logs", icon: ScrollText, soon: true },
  { label: "Integrations", href: "/dashboard/integrations", icon: Blocks, soon: true },
  { label: "Settings", href: "/dashboard/settings", icon: Settings, soon: true },
];
