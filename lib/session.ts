// The shopper's bundle and order id, kept in the browser so a page refresh (or closing the tab)
// doesn't lose them. The order itself stays on the server; only its id is kept here.

import type { BundleLine, BundleResponse } from "./types";

export type ShopperSession = {
  goal: string;
  bundle: BundleResponse;
  /** The bundle's lines after any swaps. */
  lines: BundleLine[];
  /** Low-trust lines the shopper chose to keep. */
  confirmed: string[];
  swapped: boolean;
  orderId: string | null;
};

type Stored = ShopperSession & { v: number; saved_at: number };

const KEY = "agentcart.shopper";
const VERSION = 1;
/** Same as the server: orders are closed or deleted after a day, and prices may have changed. */
const KEEP_MS = 24 * 60 * 60 * 1000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// Storage can be missing or blocked (private windows, strict cookie settings); the page then
// works as before, without surviving a refresh.
function browserStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadSession(store: Store | null = browserStore(), now = Date.now()): ShopperSession | null {
  if (!store) return null;
  try {
    const s = JSON.parse(store.getItem(KEY) ?? "null") as Partial<Stored> | null;
    const ok =
      s?.v === VERSION &&
      typeof s.saved_at === "number" &&
      now - s.saved_at < KEEP_MS &&
      typeof s.goal === "string" &&
      Array.isArray(s.bundle?.lines) &&
      Array.isArray(s.bundle?.rejected) &&
      Array.isArray(s.lines) &&
      Array.isArray(s.confirmed) &&
      (s.orderId === null || typeof s.orderId === "string");
    if (!ok) {
      store.removeItem(KEY);
      return null;
    }
    const { goal, bundle, lines, confirmed, swapped, orderId } = s as Stored;
    return { goal, bundle, lines, confirmed, swapped: !!swapped, orderId };
  } catch {
    return null;
  }
}

export function saveSession(session: ShopperSession, store: Store | null = browserStore(), now = Date.now()): void {
  try {
    store?.setItem(KEY, JSON.stringify({ ...session, v: VERSION, saved_at: now } satisfies Stored));
  } catch {
    /* storage full or blocked */
  }
}

export function clearSession(store: Store | null = browserStore()): void {
  try {
    store?.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
}
