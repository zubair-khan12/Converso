import { NextResponse } from "next/server";

import { backendSignup, setSessionCookie } from "@/lib/session";

// Same server-to-server pattern as login: the browser posts here, we call the
// backend, and on success set the JWT as an httpOnly cookie on THIS origin —
// so a brand-new account is signed in without the raw token ever reaching JS.
export async function POST(request: Request) {
  const { name, organization, email, password } = await request
    .json()
    .catch(() => ({}));

  if (!name || !organization || !email || !password) {
    return NextResponse.json(
      { error: "Please fill in every field." },
      { status: 400 },
    );
  }

  let res: Response;
  try {
    res = await backendSignup({ name, organization, email, password });
  } catch {
    return NextResponse.json(
      { error: "Can't reach the server. Is the backend running?" },
      { status: 502 },
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: data.error ?? "Could not create your account." },
      { status: res.status },
    );
  }

  await setSessionCookie(data.token, data.expires_in ?? 60 * 60 * 24 * 7);
  return NextResponse.json({ ok: true, user: data.user });
}
