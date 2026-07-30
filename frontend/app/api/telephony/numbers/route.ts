import { NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/env";
import { getSessionToken } from "@/lib/session";

// List the tenant's phone numbers.
export async function GET() {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/telephony/numbers`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Can't reach the server." }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: data.detail ?? "Could not load phone numbers." }, { status: res.status });
  }
  return NextResponse.json(data);
}

// Provision or import a phone number. Backend provisions it on Vapi and
// stores it locally.
export async function POST(request: Request) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/telephony/numbers`, {
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
    return NextResponse.json({ error: data.detail ?? "Could not create the phone number." }, { status: res.status });
  }
  return NextResponse.json(data, { status: 201 });
}
