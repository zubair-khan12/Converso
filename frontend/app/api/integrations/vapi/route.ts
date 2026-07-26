import { NextResponse } from "next/server";

import { connectVapiBackend, disconnectVapiBackend, getSessionToken } from "@/lib/session";


export async function POST(request: Request) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { api_key, public_key } = await request.json().catch(() => ({}));
  if (!api_key && !public_key) {
    return NextResponse.json({ error: "A Vapi key is required." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await connectVapiBackend(token, { api_key, public_key });
  } catch {
    return NextResponse.json({ error: "Can't reach the server." }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: data.detail ?? "Could not connect Vapi." }, { status: res.status });
  }
  return NextResponse.json(data);
}

export async function DELETE() {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const res = await disconnectVapiBackend(token);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: "Could not disconnect." }, { status: res.status });
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Can't reach the server." }, { status: 502 });
  }
}
