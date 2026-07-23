import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/config";

// Next.js 16 renamed Middleware to Proxy. This is an optimistic guard: if there's
// no session cookie, bounce to /login before rendering the dashboard. Full token
// verification still happens in the page itself (server-side).
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
