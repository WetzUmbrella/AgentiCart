import type { Line } from "./types";

// Shared by the server (lib/orders.ts) and the merchant console, so both agree on what can be shipped.

/** A wrong variant blocks the line; the merchant gets ONE repack, so two checks in total (risk R-M1). */
export const MAX_CHECKS = 2;

/** A blocked line (wrong variant) may be checked again; a cancelled ("can't fulfil") line may not. */
export const canRecheck = (l: Line) => l.state === "NOT_CHARGED" && !l.cancel_reason && (l.checks ?? 0) < MAX_CHECKS;

/** A line the merchant can still ship (or cancel): held, or blocked with its repack left. */
export const canShip = (l: Line) => l.state === "AUTHORISED" || canRecheck(l);

/** How many more label checks this line may have. */
export const checksLeft = (l: Line) =>
  l.state === "AUTHORISED" || (l.state === "NOT_CHARGED" && !l.cancel_reason) ? Math.max(0, MAX_CHECKS - (l.checks ?? 0)) : 0;
