/** status 0 means PayPal never answered (timeout, DNS failure, connection reset). */
export class PayPalError extends Error {
  constructor(public status: number, public body: string, public path: string) {
    super(`${path} → ${status}: ${body}`);
  }
  get issue(): string | undefined {
    try {
      return JSON.parse(this.body)?.details?.[0]?.issue;
    } catch {
      return undefined;
    }
  }
}

/**
 * True when we cannot tell whether PayPal acted on the request: a timeout, a dropped
 * connection, a PayPal 5xx or a 429. A clear 4xx answer (for example 422 AUTHORIZATION_VOIDED)
 * means PayPal did NOT act, so it is not uncertain.
 */
export function isUncertain(err: unknown): boolean {
  if (err instanceof PayPalError) return err.status === 0 || err.status >= 500 || err.status === 429;
  return true; // anything else that threw mid-request: assume we cannot know
}
