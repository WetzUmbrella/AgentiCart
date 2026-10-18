"use client";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { NewLine } from "@/lib/orders";

type Props = {
  lines: NewLine[];
  mode: "mock" | "sandbox";
  clientId: string | null;
  disabled: boolean;
  onAuthorised: (orderId: string) => void;
  onError: (message: string) => void;
};

/**
 * Sandbox: the real PayPal button with intent "authorize" (it must match the order's intent).
 * Mock: a clearly labelled stand-in that runs the same two API calls.
 */
export default function PayButton({ lines, mode, clientId, disabled, onAuthorised, onError }: Props) {
  // A ref so the PayPal callbacks always see the lines after a Swap (review 1.25).
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);
  const [busy, setBusy] = useState(false);

  const create = async () => (await api<{ orderId: string }>("/api/orders", { body: { lines: linesRef.current } })).orderId;
  const authorise = async (orderId: string) => {
    await api(`/api/orders/${orderId}/authorize`, { method: "POST" });
    onAuthorised(orderId);
  };

  if (mode === "mock" || !clientId) {
    return (
      <div className="stack">
        <button
          disabled={disabled || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await authorise(await create());
            } catch (e) {
              onError(e instanceof Error ? e.message : "Approval failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Approving…" : "Approve with PayPal (simulated)"}
        </button>
        <p className="small muted">Mock PayPal mode: no PayPal account is used. Set PAYPAL_MODE=sandbox for the real flow.</p>
      </div>
    );
  }

  return (
    <PayPalScriptProvider options={{ clientId, intent: "authorize", currency: "USD" }}>
      <PayPalButtons
        disabled={disabled}
        forceReRender={[JSON.stringify(lines)]}
        style={{ layout: "vertical", label: "paypal" }}
        createOrder={async () => {
          try {
            return await create();
          } catch (e) {
            onError(e instanceof Error ? e.message : "Could not create the order.");
            throw e;
          }
        }}
        onApprove={async (data) => {
          try {
            await authorise(data.orderID);
          } catch (e) {
            // Do not report success if the authorisation failed (review 1.26).
            onError(e instanceof Error ? e.message : "Authorisation failed. Please try again.");
          }
        }}
        onError={() => onError("PayPal could not complete the approval. Nothing was charged.")}
      />
    </PayPalScriptProvider>
  );
}
