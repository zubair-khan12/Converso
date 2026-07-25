import { NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/env";
import { getSessionToken } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

// Re-push a failed agent to Vapi.
export async function POST(_request: Request, { params }: Ctx) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { id } = await params;

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/agents/${id}/retry`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Can't reach the server." }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: data.detail ?? "Could not retry provisioning." }, { status: res.status });
  }
  return NextResponse.json(data);
}
