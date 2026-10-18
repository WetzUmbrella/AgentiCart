// Central place for environment settings. Server-side only.

export type PayPalMode = "mock" | "sandbox";
export type AiMode = "mock" | "live";

export const config = {
  get paypalMode(): PayPalMode {
    return process.env.PAYPAL_MODE === "sandbox" ? "sandbox" : "mock";
  },
  get aiMode(): AiMode {
    return process.env.AI_MODE === "live" ? "live" : "mock";
  },
  get multiMerchant(): boolean {
    return process.env.PAYPAL_MULTI_MERCHANT === "1";
  },
  get paypalBase(): string {
    return process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";
  },
  get maxAiCallsPerDay(): number {
    const n = Number(process.env.MAX_AI_CALLS_PER_DAY);
    return Number.isFinite(n) && n > 0 ? n : 300;
  },
  merchantEmail(merchant: string): string | undefined {
    const key = `MERCHANT_${merchant.replace("merchant_", "").toUpperCase()}_EMAIL`;
    return process.env[key] || undefined;
  },
};
