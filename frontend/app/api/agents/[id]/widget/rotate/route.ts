import { NextResponse } from "next/server";

import { backendUrl } from "@/lib/env";
import { getSessionToken } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

// Issue a new public token for this agent.
export async function POST(_request: Request, { params }: Ctx) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { id } = await params;

  let res: Response;
  try {
    res = await fetch(`${backendUrl()}/api/agents/${id}/widget/rotate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Can't reach the server." }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: data.detail ?? "Could not issue a new token." },
      { status: res.status },
    );
  }
  return NextResponse.json(data);
}
