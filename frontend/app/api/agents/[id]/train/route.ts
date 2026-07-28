import { NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/env";
import { getSessionToken } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

// Train the agent: chunk + embed its knowledge sources into pgvector, then
// re-provision the Vapi assistant so calls route through the RAG brain.
export async function POST(_request: Request, { params }: Ctx) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { id } = await params;

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/agents/${id}/train`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Can't reach the server." }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: data.detail ?? "Could not train the agent." }, { status: res.status });
  }
  return NextResponse.json(data);
}
