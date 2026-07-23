import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { BACKEND_URL, COOKIE_SECURE, SESSION_COOKIE } from "@/lib/config";

// Server-to-server credential exchange. The browser posts here; we call Flask,
// and on success set the JWT as an httpOnly cookie on THIS (Next.js) origin.
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
    res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
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

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, data.token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: data.expires_in ?? 60 * 60 * 24 * 7,
  });

  return NextResponse.json({ ok: true, user: data.user });
}
