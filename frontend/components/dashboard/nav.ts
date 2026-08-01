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

export const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Configure Vapi", href: "/dashboard/vapi-setup", icon: KeyRound },
  { label: "Agents", href: "/dashboard/agents", icon: Bot, requiresVapi: true },
  { label: "Knowledge Base", href: "/dashboard/knowledge", icon: BookOpen, requiresVapi: true },
  { label: "Phone Numbers", href: "/dashboard/phone-numbers", icon: Phone, requiresVapi: true },
  { label: "Call Logs", href: "/dashboard/call-logs", icon: ScrollText, soon: true },
  { label: "Integrations", href: "/dashboard/integrations", icon: Blocks, requiresVapi: true },
  { label: "Settings", href: "/dashboard/settings", icon: Settings, soon: true },
];
