import { notFound, redirect } from "next/navigation";

import { ChatPanel } from "@/components/dashboard/chat-panel";
import { getAgent, getCurrentUser } from "@/lib/session";

export const metadata = {
  title: "Chat · Converso",
};

type Props = {
  // Async in this version of Next.js — see AGENTS.md.
  params: Promise<{ agentId: string }>;
};

/**
 * A chat agent's own window, deliberately outside `/dashboard`: it's opened in
 * a new tab from the Agents screen, and a popped-out conversation shouldn't
 * carry a sidebar it can't navigate back into. Auth is re-checked here because
 * the dashboard layout's gate doesn't cover this route.
 */
export default async function ChatWindowPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { agentId } = await params;
  const agent = await getAgent(agentId);
  if (!agent || agent.kind !== "chat") notFound();

  return <ChatPanel agent={agent} />;
}
