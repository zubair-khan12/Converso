import { NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/env";
import { getSessionToken } from "@/lib/session";

/** Same-origin proxy to the backend's Cal.com endpoints, so the JWT stays in
 *  the httpOnly cookie and never reaches the browser's JavaScript. */
async function proxy(method: string, body?: unknown, fallbackError = "Something went wrong.") {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/integrations/calcom`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Can't reach the server." }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: data.detail ?? fallbackError }, { status: res.status });
  }
  return NextResponse.json(data);
}

export async function GET() {
  return proxy("GET", undefined, "Could not load your Cal.com connection.");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return proxy("POST", body, "Could not connect Cal.com.");
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  return proxy("PATCH", body, "Could not select that event type.");
}

export async function DELETE() {
  return proxy("DELETE", undefined, "Could not disconnect.");
}
