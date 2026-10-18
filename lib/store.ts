import type { Order } from "./types";

// In-memory demo store. Survives hot reload, not restarts (Render free tier can restart at any time).
const g = globalThis as unknown as { __agentcartOrders?: Map<string, Order> };
export const orders: Map<string, Order> = (g.__agentcartOrders ??= new Map<string, Order>());

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function pruneOld(now = Date.now()): void {
  for (const [id, o] of orders) if (now - o.created_at > MAX_AGE_MS) orders.delete(id);
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
  return orders.delete(orderId);
}

export function logEvent(order: Order, event: string): void {
  order.events.push(`${new Date().toISOString()} ${event}`);
}
