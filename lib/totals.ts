import type { Line, Order } from "./types";

export type Totals = {
  authorised: number;
  charged: number;
  held: number;
  notCharged: number;
  released: number | null; // only known once the order is closed (review 1.27)
};

/** Money figures for the ledger, in cents. */
export function totalsFor(order: Order | null): Totals {
  if (!order) return { authorised: 0, charged: 0, held: 0, notCharged: 0, released: null };
  const sum = (ls: Line[]) => ls.reduce((s, l) => s + l.amount_cents, 0);
  const authorisedLines = order.lines.filter((l) => l.auth_id);
  const authorised = order.status === "CREATED" ? 0 : sum(authorisedLines);
  const charged = sum(order.lines.filter((l) => l.state === "CAPTURED"));
  const notCharged = sum(order.lines.filter((l) => l.state === "NOT_CHARGED" || l.state === "CAPTURE_FAILED"));
  const closed = order.status === "CLOSED";
  return {
    authorised,
    charged,
    notCharged,
    held: closed ? 0 : authorised - charged,
    released: closed ? order.released_cents ?? authorised - charged : null,
  };
}
