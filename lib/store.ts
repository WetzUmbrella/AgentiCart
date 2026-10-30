import type { Order, ShipPhoto } from "./types";

// In-memory demo store. Survives hot reload, not restarts (Render free tier can restart at any time).
const g = globalThis as unknown as {
  __agentcartOrders?: Map<string, Order>;
  __agentcartPhotos?: Map<string, Map<string, ShipPhoto>>;
};
export const orders: Map<string, Order> = (g.__agentcartOrders ??= new Map<string, Order>());
// Label photos live beside the orders, not inside them, so polling an order never resends images.
const photos: Map<string, Map<string, ShipPhoto>> = (g.__agentcartPhotos ??= new Map());

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function pruneOld(now = Date.now()): void {
  for (const [id, o] of orders) {
    if (now - o.created_at > MAX_AGE_MS) {
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

/** Order-scoped reset: one judge can never wipe another judge's order. */
export function resetOrder(orderId: string): boolean {
  photos.delete(orderId);
  return orders.delete(orderId);
}

export function savePhoto(orderId: string, lineId: string, photo: ShipPhoto): void {
  if (!photos.has(orderId)) photos.set(orderId, new Map());
  photos.get(orderId)!.set(lineId, photo);
}

export function getPhoto(orderId: string, lineId: string): ShipPhoto | undefined {
  return photos.get(orderId)?.get(lineId);
}

export function deletePhoto(orderId: string, lineId: string): void {
  photos.get(orderId)?.delete(lineId);
}

export function logEvent(order: Order, event: string): void {
  order.events.push(`${new Date().toISOString()} ${event}`);
}
