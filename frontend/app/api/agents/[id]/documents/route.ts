import { NextResponse } from "next/server";

import { backendUrl } from "@/lib/env";
import { getSessionToken } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

// List an agent's knowledge sources.
export async function GET(_request: Request, { params }: Ctx) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { id } = await params;

  let res: Response;
  try {
    res = await fetch(`${backendUrl()}/api/agents/${id}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Can't reach the server." }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: data.detail ?? "Could not load documents." }, { status: res.status });
  }
  return NextResponse.json(data);
}

// Add a pasted-text knowledge source.
export async function POST(request: Request, { params }: Ctx) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  let res: Response;
  try {
    res = await fetch(`${backendUrl()}/api/agents/${id}/documents/text`, {
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
    return NextResponse.json({ error: data.detail ?? "Could not add the text." }, { status: res.status });
  }
  return NextResponse.json(data, { status: 201 });
}
