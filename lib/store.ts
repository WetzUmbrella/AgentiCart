import type { Order, ShipPhoto } from "./types";

// In-memory demo store. Survives hot reload, not restarts (Render free tier can restart at any time).
const g = globalThis as unknown as {
  __agentcartOrders?: Map<string, Order>;
  __agentcartPhotos?: Map<string, Map<string, ShipPhoto>>;
};
export const orders: Map<string, Order> = (g.__agentcartOrders ??= new Map<string, Order>());
// Label photos live beside the orders, not inside them, so polling an order never resends images.
const photos: Map<string, Map<string, ShipPhoto>> = (g.__agentcartPhotos ??= new Map());

/** Closed orders stay readable for a day so the shopper and merchant can still see the result. */
const KEEP_CLOSED_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes CLOSED orders a day after closing. Open orders are never deleted here: they may still
 * hold money at PayPal, so sweepStale() in orders.ts releases and closes them first (risk R-S2).
 */
export function pruneOld(now = Date.now()): void {
  for (const [id, o] of orders) {
    if (o.status === "CLOSED" && now - (o.closed_at ?? o.created_at) > KEEP_CLOSED_MS) {
      orders.delete(id);
      photos.delete(id);
    }
  }
}

export function getOrder(orderId: string): Order | undefined {
  pruneOld();
  return orders.get(orderId);
}

export function saveOrder(order: Order): void {
  orders.set(order.orderId, order);
}

/**
 * Forgets one order without touching PayPal. Routes use resetOrderSafely() in orders.ts,
 * which releases the hold first.
 */
export function resetOrder(orderId: string): boolean {
  photos.delete(orderId);
  return orders.delete(orderId);
}

// A line can have several photos (one per label check, D5), numbered from 1.
const photoKey = (lineId: string, n: number) => `${lineId}#${n}`;

export function savePhoto(orderId: string, lineId: string, n: number, photo: ShipPhoto): void {
  if (!photos.has(orderId)) photos.set(orderId, new Map());
  photos.get(orderId)!.set(photoKey(lineId, n), photo);
}

export function getPhoto(orderId: string, lineId: string, n: number): ShipPhoto | undefined {
  return photos.get(orderId)?.get(photoKey(lineId, n));
}

export function deletePhoto(orderId: string, lineId: string, n: number): void {
  photos.get(orderId)?.delete(photoKey(lineId, n));
}

export function logEvent(order: Order, event: string): void {
  order.events.push(`${new Date().toISOString()} ${event}`);
}
