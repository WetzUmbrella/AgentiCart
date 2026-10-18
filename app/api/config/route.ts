import { config } from "@/lib/config";
import type { AppConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

export function GET() {
  const body: AppConfig = {
    paypalMode: config.paypalMode,
    aiMode: config.aiMode,
    clientId: config.paypalMode === "sandbox" ? process.env.PAYPAL_CLIENT_ID ?? null : null,
    multiMerchant: config.multiMerchant,
  };
  return Response.json(body);
}
