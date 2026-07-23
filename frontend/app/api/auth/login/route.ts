import { NextResponse } from "next/server";

import { backendLogin, setSessionCookie } from "@/lib/session";

// Server-to-server credential exchange. The browser posts here; we call the
// backend, and on success set the JWT as an httpOnly cookie on THIS origin.
export async function POST(request: Request) {
  const { email, password } = await request.json().catch(() => ({}));

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  let res: Response;
  try {
    res = await backendLogin(email, password);
  } catch {
    return NextResponse.json(
      { error: "Can't reach the server. Is the backend running?" },
      { status: 502 },
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: data.error ?? "Login failed." },
      { status: res.status },
    );
  }

  await setSessionCookie(data.token, data.expires_in ?? 60 * 60 * 24 * 7);
  return NextResponse.json({ ok: true, user: data.user });
}
