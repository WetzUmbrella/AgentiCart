import { PayPalError, isUncertain } from "./paypal-error";

// A thrown HttpError becomes a JSON error response with that status.
export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

export const expired = () =>
  new HttpError(404, "expired", {
    message: "This order expired (the demo server restarted or it was reset). Start again.",
  });

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message, ...err.extra }, { status: err.status });
  }
  console.error(err);
  if (err instanceof PayPalError) {
    // PayPal refused, or could not be reached even after one retry. Money calls carry a fixed
    // PayPal-Request-Id, so pressing the button again can never charge twice.
    const issue = isUncertain(err) ? (err.status === 0 ? "no response" : `HTTP ${err.status}`) : err.issue ?? `HTTP ${err.status}`;
    return Response.json(
      {
        error: "paypal_error",
        issue,
        message: `PayPal did not complete this step (${issue}). Try again; a repeat can never charge twice.`,
      },
      { status: 502 },
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return Response.json({ error: "server_error", message }, { status: 500 });
}
