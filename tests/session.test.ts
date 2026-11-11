import { describe, expect, it } from "vitest";
import { clearSession, loadSession, saveSession, type ShopperSession } from "@/lib/session";
import type { BundleResponse } from "@/lib/types";

function fakeStore(initial?: string) {
  const data = new Map<string, string>(initial === undefined ? [] : [["agentcart.shopper", initial]]);
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const bundle = { lines: [], rejected: [] } as unknown as BundleResponse;
const session: ShopperSession = { goal: "Podcast setup", bundle, lines: [], confirmed: ["line-2"], swapped: true, orderId: "ORDER1" };
const HOUR = 60 * 60 * 1000;

describe("shopper session", () => {
  it("returns what was saved", () => {
    const store = fakeStore();
    saveSession(session, store, 1000);
    expect(loadSession(store, 1000 + HOUR)).toEqual(session);
  });

  it("keeps a bundle that has no order yet", () => {
    const store = fakeStore();
    saveSession({ ...session, orderId: null }, store);
    expect(loadSession(store)?.orderId).toBeNull();
  });

  it("drops a session older than a day", () => {
    const store = fakeStore();
    saveSession(session, store, 1000);
    expect(loadSession(store, 1000 + 25 * HOUR)).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it("drops anything it does not recognise", () => {
    for (const bad of ["not json", "{}", JSON.stringify({ v: 0, saved_at: Date.now(), ...session }), JSON.stringify({ v: 1, saved_at: Date.now(), goal: "x" })]) {
      expect(loadSession(fakeStore(bad))).toBeNull();
    }
  });

  it("forgets the session on clear", () => {
    const store = fakeStore();
    saveSession(session, store);
    clearSession(store);
    expect(loadSession(store)).toBeNull();
  });

  it("does nothing without storage, or when storage throws", () => {
    expect(loadSession(null)).toBeNull();
    saveSession(session, null);
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadSession(broken)).toBeNull();
    expect(() => saveSession(session, broken)).not.toThrow();
    expect(() => clearSession(broken)).not.toThrow();
  });
});
