

export const BACKEND_URL =
  process.env.BACKEND_URL ?? "http://localhost:5000";

export const SESSION_COOKIE = "converso_session";

// Secure cookies require HTTPS, so only enable in production (dev runs on http).
export const COOKIE_SECURE = process.env.NODE_ENV === "production";
