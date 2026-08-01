// Environment + cookie config. Server-side values (BACKEND_URL) are only ever
// read inside Route Handlers / server components, never shipped to the browser.

// Deliberately NOT prefixed `NEXT_PUBLIC_` — that would inline it into the
// browser bundle. Route Handlers read it server-side and proxy, so the browser
// never learns the backend's address.
//
// The localhost fallback is a dev convenience only: falling back in production
// would send every request to a backend that isn't there and look like a
// mysterious outage, so a missing value fails the build/boot instead.
if (process.env.NODE_ENV === "production" && !process.env.BACKEND_URL) {
  throw new Error(
    "BACKEND_URL is not set. Set it to the deployed FastAPI origin " +
      "(e.g. https://api.yourdomain.com) in the hosting environment.",
  );
}

export const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:5000";

export const SESSION_COOKIE = "converso_session";

// `Secure` cookies require HTTPS, so only enable it in production (dev is http).
export const COOKIE_SECURE = process.env.NODE_ENV === "production";
