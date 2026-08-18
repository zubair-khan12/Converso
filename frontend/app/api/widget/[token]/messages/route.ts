import { NextResponse } from "next/server";

import { backendUrl } from "@/lib/env";

type Ctx = { params: Promise<{ token: string }> };

/**
 * One turn of a *public* widget chat. Unlike every other route handler here,
 * this one attaches no session — the caller is an anonymous visitor on someone
 * else's website. It forwards the embedding origin so the backend can check it
 * against that agent's allowlist.
 */
export async function POST(request: Request, { params }: Ctx) {
  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  const origin = request.headers.get("x-widget-origin") ?? "";

  let res: Response;
  try {
    res = await fetch(`${backendUrl()}/api/widget/${token}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Widget-Origin": origin },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "The assistant is unreachable right now." },
      { status: 502 },
    );
  }

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
