import { NextResponse } from "next/server";

import { backendUrl } from "@/lib/env";
import { getSessionToken } from "@/lib/session";

type Ctx = { params: Promise<{ agentId: string }> };

// One turn of a chat: the message goes to the backend, which runs the same
// LangGraph brain a voice call uses and returns the reply plus its trace.
export async function POST(request: Request, { params }: Ctx) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { agentId } = await params;
  const body = await request.json().catch(() => ({}));

  let res: Response;
  try {
    res = await fetch(`${backendUrl()}/api/chat/${agentId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Can't reach the server." }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: data.detail ?? "The agent could not reply." },
      { status: res.status },
    );
  }
  return NextResponse.json(data);
}
