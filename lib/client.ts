// Browser-side helpers for calling our API routes.

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public body: Record<string, unknown>) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  expired: "This order expired (the demo server restarted or it was reset). Press Start over.",
  line_not_authorised: "This part was already processed, so nothing was done. It can never be charged twice.",
  order_closed: "This order is already finished. Nothing more can be shipped or charged.",
  still_processing: "A part is still being checked. Try again in a moment.",
  check_failed: "The label check failed. Nothing was charged. Try again.",
  bad_tracking_number: "Use up to 40 letters, digits or hyphens for the tracking number.",
  ai_daily_cap: "The demo has used its AI budget for today. Try again tomorrow.",
  ai_timeout: "The AI took too long to answer. Nothing was charged. Try again.",
  ai_busy: "Google's AI service is busy right now. Nothing was charged. Try again in a minute.",
  ai_rate_limited: "The AI is busy or rate limited. Wait a minute and try again.",
  spec_missing: "A spec sheet is missing on the server.",
};

function toApiError(status: number, body: Record<string, unknown>): ApiError {
  const code = String(body.error ?? status);
  const message = String(body.message ?? MESSAGES[code] ?? `Request failed (${status}).`);
  return new ApiError(status, code, message, body);
}

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
  if (!res.ok) throw toApiError(res.status, body);
  return body as T;
}

/**
 * POSTs to a route that streams NDJSON events and ends with { type: "done", <key>: result }
 * or { type: "error", status, error, message }. Each other event goes to onEvent.
 */
export async function apiStream<T, E>(path: string, body: unknown, key: string, onEvent: (e: E) => void): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok || !res.body) {
    let err: Record<string, unknown> = {};
    try {
      err = await res.json();
    } catch {
      /* non-JSON error page */
    }
    throw toApiError(res.status, err);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += value ?? "";
    const lines = buffer.split("\n");
    buffer = done ? "" : lines.pop()!;
    for (const line of lines.filter((l) => l.trim())) {
      const event = JSON.parse(line) as Record<string, unknown> & { type: string };
      if (event.type === "done") return event[key] as T;
      if (event.type === "error") throw toApiError(Number(event.status) || 500, event);
      onEvent(event as E);
    }
    if (done) throw new ApiError(502, "stream_ended", "The connection closed before the bundle was ready. Try again.", {});
  }
}

export const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
