// Browser-side helpers for calling our API routes.

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public body: Record<string, unknown>) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  expired: "This order expired (the demo server restarted or it was reset). Press Start over.",
  line_not_authorised: "This part was already processed.",
  still_processing: "A part is still being checked. Try again in a moment.",
  check_failed: "The model check failed. Nothing was charged. Try again.",
  bad_tracking_number: "Use up to 40 letters, digits or hyphens for the tracking number.",
  ai_daily_cap: "The demo has used its AI budget for today. Try again tomorrow.",
  spec_missing: "A spec sheet is missing on the server.",
};

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const code = String(body.error ?? res.status);
    const message = String(body.message ?? MESSAGES[code] ?? `Request failed (${res.status}).`);
    throw new ApiError(res.status, code, message, body);
  }
  return body as T;
}

export const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
