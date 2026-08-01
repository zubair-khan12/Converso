import { NextResponse } from "next/server";

import { backendUrl } from "@/lib/env";
import { getSessionToken } from "@/lib/session";

type Ctx = { params: Promise<{ id: string; docId: string }> };

// Delete a knowledge source (and its embedded chunks, via DB cascade).
export async function DELETE(_request: Request, { params }: Ctx) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { id, docId } = await params;

  let res: Response;
  try {
    res = await fetch(`${backendUrl()}/api/agents/${id}/documents/${docId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Can't reach the server." }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: data.detail ?? "Could not delete the document." }, { status: res.status });
  }
  return NextResponse.json(data);
}
