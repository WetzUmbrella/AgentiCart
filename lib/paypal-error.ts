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
