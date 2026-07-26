import { NextResponse } from "next/server";

import { getSessionToken, markOnboarded } from "@/lib/session";

// Called when the user finishes or skips the getting-started tour. The JWT
// stays server-side; the browser just pings this same-origin endpoint.
export async function POST() {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const res = await markOnboarded(token);
    if (!res.ok) {
      return NextResponse.json({ error: "Could not save." }, { status: res.status });
    }
  } catch {
    return NextResponse.json({ error: "Can't reach the server." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
