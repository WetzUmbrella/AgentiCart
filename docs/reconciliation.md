# Reconciliation: proving every cent is accounted for

`lib/reconcile.ts`, tests in `tests/reconcile.test.ts`, endpoint `GET /api/orders/:id/reconcile`.

## What it proves

For one order:

```
held = charged + released + still held + unknown
```

and that our record agrees with itself and with PayPal's. The result is `PASS`, `FAIL` or `UNKNOWN`, with the five totals in cents and one plain reason per problem, naming the line or authorisation.

`settled: true` means the books for this order are finished: it is closed, nothing is still held, nothing is unknown, and (version 2) PayPal agrees.

## Where each line's money sits

| Line | Bucket |
|---|---|
| No `auth_id` | Not held. Only valid while `IN_BUNDLE`. |
| `capture_uncertain` (any state) | **Unknown.** Never charged, never released. |
| `CAPTURED` | Charged. Must have a `capture_id`. |
| `NOT_CHARGED`, `CAPTURE_FAILED` | Released if its authorisation is in `voided_auth_ids`, otherwise still held. |
| `VOIDED` | Released. Must be in `voided_auth_ids`. |
| `AUTHORISED`, `SHIPPED`, `IN_BUNDLE` with `auth_id` | Still held. FAIL if its authorisation was voided. |
| Any other state | FAIL: the check does not guess. |

## The checks that can fail

The identity alone is true by construction: each line goes in exactly one bucket. What makes this a check is the rules around it:

1. **Closed means nothing held.** After close, any still-held cent is money stuck at PayPal: FAIL.
2. **Two counts of "released" must agree.** `closeOrder` writes `released_cents`; reconcile recounts it from the lines. A difference means one of them is wrong.
3. **Impossible states fail.** Charged with no capture ID; voided with no confirmed void; chargeable on a voided hold; a state the check does not know.
4. **Version 2, against PayPal** (captures matched by the `invoice_id` every capture carries):
   - PayPal shows a charge we record as not charged: FAIL. The shopper paid and the merchant was told not to ship.
   - We record a charge PayPal does not have: FAIL. The merchant ships and nobody paid.
   - A PayPal charge that belongs to no line: FAIL.
   - Authorisation status must match: `VOIDED` if we released it, `CAPTURED` if every line on it was charged, otherwise still holding (`CREATED` or `PARTIALLY_CAPTURED`). `EXPIRED` while we think it holds: FAIL.
   - Amounts, when PayPal returns them: per capture, and the authorised total against the sum of our lines.
   - PayPal unreachable or a charge `PENDING`: UNKNOWN.

Every rule above was tested by breaking it on purpose (17 deliberate breaks): each one makes at least one test fail.

## Design choices

**Read-only, enforced by type.** The PayPal version accepts only `getOrder` and `getAuthorization`. It cannot be handed `captureAuthorization` or `voidAuthorization`, so a bug in the checker cannot move money. It also never edits the order, so it is safe to call at any time, including mid-order. Unlike `GET /api/orders/:id`, the endpoint does not run the 24 h auto-close sweep, because that sweep voids holds and a read should never move money.

**Independent of the code it checks.** The bucket rules are written from the line states, not by calling `closeOrder`'s helpers (`HOLDING`, `holdsMoney`). If reconcile reused them, a bug in close would pass its own check.

**Fails closed.** Anything it cannot place is UNKNOWN, never PASS. An uncertain capture stays UNKNOWN even when PayPal shows the charge, until close records it, because until then the merchant is still being told "do not ship".

**Separate files.** Nothing in `lib/orders.ts` or `tests/orders.test.ts` changed, so the four known conflicts with `c-frontend` and their written resolution are unaffected. The tests run both before and after that merge (89 and 120 passing).

## What it does not prove yet

- **Amounts at PayPal in mock mode.** The mock returns no amounts, so those checks only run against the sandbox. In tests, `mockCapturedCents` and `mockIsVoided` stand in. They have now run once against the real sandbox (12 Nov, order `9WC24662Y7928940Y`): PASS, settled, `MATCHED`, with both capture amounts and the $100.00 authorisation checked.
- **The app's own close, end to end.** That sandbox run built the closed order by hand from real IDs, so it proves the comparison with PayPal, not `closeOrder`. A full run through the app is still owed (H17).
- **Fees.** `charged_cents` is what the shopper paid, not what the merchant receives. PayPal takes a fee on each capture (test 2: $2.00 and $1.32 on $50.00 and $30.00 captures); reconcile does not model it.
- **Lost orders.** Orders live in memory; after a restart there is no record to reconcile. Rebuilding one from PayPal's record is possible but not built.
- **Refunds and reauthorisation** are not modelled, because neither is built.
- **Access.** The endpoint shows the same order data `GET /api/orders/:id` already does, to anyone with the order ID.

## Demo

After a demo order closes: `GET /api/orders/<id>/reconcile` shows `"status": "PASS", "settled": true` with the totals. That is the screenshot for "authorised = captured + voided for every demo order".
