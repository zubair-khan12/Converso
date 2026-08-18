import { headers } from "next/headers";

import { WidgetChat } from "@/components/widget/widget-chat";
import { WidgetVoice } from "@/components/widget/widget-voice";
import { WidgetRefusal } from "@/components/widget/widget-refusal";
import { backendUrl } from "@/lib/env";
import type { WidgetConfig } from "@/lib/types";

export const metadata = {
  title: "Assistant",
  // Nothing here should ever appear in search results — it's a fragment meant
  // to live inside someone else's page.
  robots: { index: false, follow: false },
};

type Props = {
  // Async in this version of Next.js — see AGENTS.md.
  params: Promise<{ token: string }>;
  searchParams: Promise<{ o?: string }>;
};

/** The origin of the page embedding us.
 *
 *  `Referer` is set by the browser on the iframe request and cannot be forged
 *  by the embedding page's own JavaScript, so it's preferred. The `?o=` the
 *  launcher script adds is the fallback for browsers sending a trimmed referrer
 *  policy — weaker, which is why the backend also rate-limits.
 */
function embeddingOrigin(referer: string | null, claimed?: string): string {
  for (const candidate of [referer, claimed]) {
    if (!candidate) continue;
    try {
      return new URL(candidate).origin;
    } catch {
      // Not a URL — try the next candidate.
    }
  }
  return "";
}

export default async function WidgetPage({ params, searchParams }: Props) {
  const [{ token }, { o }, headerList] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);
  const origin = embeddingOrigin(headerList.get("referer"), o);

  const res = await fetch(`${backendUrl()}/api/widget/${token}`, {
    headers: { "X-Widget-Origin": origin },
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) {
    const body = await res?.json().catch(() => ({}));
    // Say which of the two it is: "not allowed here" is a setup mistake the
    // site owner can fix, and a generic failure would send them hunting.
    return (
      <WidgetRefusal
        message={
          body?.error ??
          "This assistant is unavailable. Check the embed snippet and the allowed websites in your dashboard."
        }
      />
    );
  }

  const config: WidgetConfig = await res.json();

  return config.kind === "voice" ? (
    <WidgetVoice config={config} />
  ) : (
    <WidgetChat config={config} token={token} origin={origin} />
  );
}
