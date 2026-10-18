# Rebuild the PayPal sandbox in 30 minutes

1. https://developer.paypal.com → Apps & Credentials → toggle **Sandbox** → Create App `agentcart` (Merchant). Copy Client ID and Secret.
2. Testing Tools → Sandbox Accounts → create, all with country **United States**:
   - Personal: `shopper` (team use)
   - Personal: `judge` (credentials go in the README and Devpost testing instructions)
   - Business: `merchant_a`, `merchant_b`, `merchant_c` (only needed for multi-merchant)
3. Render → the `agentcart` service → Environment: set `PAYPAL_MODE=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_API_BASE=https://api-m.sandbox.paypal.com`.
4. PayPal app → Webhooks → Add `https://<render-url>/api/paypal/webhook` with events `CHECKOUT.ORDER.APPROVED`, `PAYMENT.AUTHORIZATION.CREATED`, `PAYMENT.AUTHORIZATION.VOIDED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`.
5. Copy the Webhook ID into Render's `PAYPAL_WEBHOOK_ID` and redeploy.
6. Check: run one order on the hosted site and look for `WEBHOOK PAYMENT.CAPTURE.COMPLETED` in `GET /api/orders/<id>` events.

Never put the values in this file or anywhere in the repo.
