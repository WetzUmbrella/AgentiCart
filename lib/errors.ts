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
  const message = err instanceof Error ? err.message : String(err);
  return Response.json({ error: "server_error", message }, { status: 500 });
}
