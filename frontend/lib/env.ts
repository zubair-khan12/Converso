// Environment + cookie config. Server-side values (BACKEND_URL) are only ever
// read inside Route Handlers / server components, never shipped to the browser.

// Deliberately NOT prefixed `NEXT_PUBLIC_` — that would inline it into the
// browser bundle. Route Handlers read it server-side and proxy, so the browser
// never learns the backend's address.
//
// Read per call, never at module scope. `next build` imports every route module
// to collect page data, so a module-level throw fails the *build* on a machine
// that legitimately has no backend configured yet — and a module-level constant
// would bake in whatever value existed at build time, which is wrong for a
// runtime setting. Both problems disappear by resolving it when a request
// actually needs it.
export function backendUrl(): string {
  const url = process.env.BACKEND_URL;
  if (url) return url;
  // Falling back in production would silently route every request to a backend
  // that isn't there and read as a mysterious outage, so fail loudly instead.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BACKEND_URL is not set. Set it to the deployed FastAPI origin " +
        "(e.g. https://api.yourdomain.com) in the hosting environment.",
    );
  }
  return "http://localhost:5000";
}

export const SESSION_COOKIE = "converso_session";

// Where a customer is pointed when they need a human — currently only the
// disabled-account screen. Safe to inline into the bundle (it's on the
// marketing site anyway), hence NEXT_PUBLIC_.
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@converso.ai";

// `Secure` cookies require HTTPS, so only enable it in production (dev is http).
export const COOKIE_SECURE = process.env.NODE_ENV === "production";
