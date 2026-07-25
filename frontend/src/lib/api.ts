// NEXT_PUBLIC_API_URL is baked in at build time (Next.js requirement for
// client-side env vars), so it must be set in the hosting provider's build
// environment, not just at runtime. Falls back to local dev.
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
