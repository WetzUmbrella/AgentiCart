# Risk register (owner: A, with B, C and D for their rows)

What can go wrong, what the code does today, and the exact alternative. Written 21 Oct 2026 against branch `feat/a-payments-hardening`.

**Status key:** **Built** = in the code with a test. **Proposed** = built as a separate commit, waiting for a team decision. **Process** = handled by a person or a checklist, not code. **Next step** = not built; goes in the README "limits" section or on the next-step slide.

**The rule behind every row:** when we cannot tell what happened to money, we ask PayPal's own record instead of guessing, and until PayPal answers we neither tell the merchant to ship nor tell the shopper money was released.

## Two facts to confirm in Saturday's go/no-go test 2

**Both confirmed** in the sandbox: void after partial captures in test 2 (30 Oct) and again on 12 Nov; `invoice_id` on each capture in the order record on 12 Nov (order `9WC24662Y7928940Y`, `docs/go-no-go.md`).

| Fact | Why it matters | If it is false |
|---|---|---|
| PayPal's order record (`GET /v2/checkout/orders/{id}`) returns our `invoice_id` on each capture | R-P3 finds a capture whose reply was lost by this tag | Find the capture by matching amount and time instead, or treat every lost reply as "do not ship" until someone checks the sandbox dashboard |
| PayPal lets us void the rest of an authorisation after partial captures | Close releases the unused part of the single hold this way. There is no second route: PayPal's Orders v2 docs say AUTHORIZE "is not supported when you have more than one purchase_unit", so an order can only ever have one hold | Code change after the test: when PayPal refuses this void, close shows "Not charged. PayPal releases the rest of the hold automatically when it expires (29 days)" instead of "Released", and stops retrying. Where the last line to resolve is a charge, use `final_capture: true` on it instead |

## Payments (A)

| ID | Risk | What happens now | Alternative / next step | Status |
|---|---|---|---|---|
| R-P1 | PayPal times out, drops the connection, or returns 5xx or 429 | Retried once with the same `PayPal-Request-Id`, so PayPal answers the repeat with the original result and nothing is done twice. Then a 502 `paypal_error` with the reason; pressing the button again is safe | If PayPal stays down: stop the demo, wait, rerun. Sandbox status: developer.paypal.com | Built |
| R-P2 | Wrong, expired or live-mode credentials (401) | Token refreshed once; then 502 showing `HTTP 401` | Check `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_API_BASE` (playbook 12). Rebuild with `docs/sandbox-runbook.md` (30 min) | Built + Process |
| R-P3 | A capture's reply is lost (timeout, 5xx), or PayPal says the `invoice_id` was already used (`DUPLICATE_TRANSACTION` in the sandbox, 12 Nov; `DUPLICATE_INVOICE_ID` also handled) | Look the capture up in PayPal's order record by `invoice_id` (`<orderId>-<lineId>`). Found and COMPLETED: line CAPTURED. Otherwise CAPTURE_FAILED with `capture_uncertain` and "Do not ship yet". Close re-checks first; if PayPal cannot answer, close releases nothing (503) | If the lookup never works (see facts above): someone checks the sandbox merchant account before shipping | Built. Sandbox 12 Nov: the error code and `invoice_id` on captures in PayPal's order record verified; `lookupCapture` itself tested against the mock only |
| R-P4 | A void fails, or its reply is lost | PayPal's record decides: VOIDED counts as released; otherwise close returns 502 `release_failed`, the order stays open, and money is never shown as released. A retry never voids the same authorisation twice | If PayPal refuses voids after partial captures: see the second fact above (honest "releases when it expires" wording) | Built |
| R-P5 | PayPal returns an authorisation that is not CREATED (e.g. PENDING) | Its ID is kept so close can release it; the line stays IN_BUNDLE and can never be charged | Real version: wait for the `PAYMENT.AUTHORIZATION.CREATED` webhook | Built |
| R-P6 | Shopper closes the tab after approving, before authorise runs | Order approved at PayPal but never held, so nothing can be charged; the approval lapses on its own | Authorise from the `CHECKOUT.ORDER.APPROVED` webhook as a backup | Next step |
| R-P7 | Shopper cancels the PayPal popup, or PayPal declines the payment method | Order stays CREATED; nothing held; auto-closed after 24 h | PayButton `onCancel`: "Payment not approved. Nothing was charged."; `onError` for a decline | Built |
| R-P8 | A part is charged more than 3 days after approval (outside PayPal's honour period) | A refused capture becomes CAPTURE_FAILED, "Do not ship". Auto-close at 24 h means the demo never gets there. A mocked expiry in the sandbox (12 Nov) returns 422 `AUTHORIZATION_EXPIRED`, a clear refusal, so it lands in this path | Real version: reauthorise after day 3, or one order per shipment | Next step |
| R-P9 | One approval cannot pay several merchants with authorisations (go/no-go test 1) | Single-merchant by default: one purchase unit paid to the platform; merchant is a display label. PayPal's docs rule the combination out: AUTHORIZE allows one purchase unit per order, multi-seller checkout requires CAPTURE, and capturing on behalf of other merchants needs approved-partner onboarding | Pitch AgentCart as the seller; PayPal multi-seller onboarding on the next-step slide | Built |
| R-P10 | PayPal Agent Toolkit `create_order` hard-codes CAPTURE and defaults to live | Toolkit not used; REST calls only | README says exactly that | Built + Process (D) |
| R-P11 | Double click, retry, or two merchants submitting the same line | Only an AUTHORISED (or once-blocked) line passes; it is locked as SHIPPED before any wait; 409 otherwise; fixed request IDs on every money call | None needed | Built |
| R-P12 | A capture comes back PENDING | CAPTURE_FAILED with `capture_uncertain`, "Do not ship". Close refuses (409 `payment_pending`) until PayPal settles it | Real version: let the `PAYMENT.CAPTURE.COMPLETED` webhook update the line | Built |
| R-P13 | Webhook signature fails or `PAYPAL_WEBHOOK_ID` is missing | Event ignored and logged; no money logic depends on webhooks | Register the webhook after deploy (A-21) | Built + Process |
| R-P14 | We capture more than is left on a hold | PayPal does **not** stop it: the sandbox accepted a capture 1 cent over (12 Nov, $20.01 on a $20.00 auth). Our guards are the backstop: each capture is the line's `amount_cents`, fixed at order creation; the lines add up to the authorisation; a line is locked before capture and uses a fixed request ID. The mock refuses over-capture so a test fails if our code ever tries | None needed | Built |

## AI (B)

| ID | Risk | What happens now | Alternative / next step | Status |
|---|---|---|---|---|
| R-A1 | Gemini is down or slow during the packing check | The line goes back to its previous state, nothing is charged, 502 "Try again". An exact model match needs no AI, so typing the exact variant still works | B: when the typed text does not contain the variant, return DO_NOT_CAPTURE without waiting for Gemini to word the reason | Built + suggestion (B) |
| R-A2 | Gemini is down while building the bundle | `/api/bundle` fails | Verdicts are cached by product set: warm the demo bundle with `npm run warm` before recording. Last resort: mock mode, labelled on screen | Process (B, D) |
| R-A3 | The daily AI call cap is reached | `ai_daily_cap` message | Raise `MAX_AI_CALLS_PER_DAY` for judging (1 to 15 Dec) | Process (B) |
| R-A4 | The AI says "match" for the wrong variant | Two-key rule: code also requires the typed text to contain the verified variant, so the AI alone can never charge | None needed | Built |
| R-A5 | Prompt injection in the merchant's text | 64 characters of letters, digits and `./-` only; passed to Gemini as data; two-key rule | None needed | Built |
| R-A6 | A wrong compatibility verdict | Every verdict quotes the spec sheet; accuracy reported honestly from the held-out test set | README states the score | Process (B, D) |

## Merchant and process

| ID | Risk | What happens now | Alternative / next step | Status |
|---|---|---|---|---|
| R-M1 | Merchant packs the wrong variant | Blocked before dispatch, never charged. One repack allowed; a second mismatch cancels the line | Merchant console: a blocked line with a check left shows "Recheck"; an unreadable photo is not counted (D3) | Built (kept 6 Nov) |
| R-M2 | Part goes out of stock after the shopper approved | "Can't fulfil" (`POST /api/cancel-line`) cancels the line; never charged; released at close | Merchant console: "Can't fulfil this part" with an optional reason, shown to the shopper | Built (kept 6 Nov) |
| R-M3 | Merchant types the right model but packs the wrong part | Not detectable: the check reads typed text, not the box | README limit. Next step: barcode scan or label photo matched to the catalogue | Next step |
| R-M4 | Nobody finishes the order | Auto-closed and released after 24 h | None needed | Built |

## Server and hosting

| ID | Risk | What happens now | Alternative / next step | Status |
|---|---|---|---|---|
| R-S1 | Render restarts and the in-memory store is wiped | Shopper sees "order expired". Captures already made stay made; remaining holds expire at PayPal on their own (sandbox money) | Next step: rebuild an order from PayPal's record (`GET` order) when it is missing | Next step |
| R-S2 | An order is forgotten while PayPal still holds its money | Fixed: open orders are never pruned; they are auto-closed after 24 h first. "Start over" releases the hold before forgetting the order, and keeps it if PayPal cannot confirm | None needed | Built |
| R-S3 | The hosted demo is asleep when a judge opens it | About 1 minute to wake | `npm run warm` before recording; weekly check until 15 Dec (A-31) | Process (A, D) |
| R-S4 | Routes have no login | Anyone with an order ID can ship or close that order; IDs are PayPal's and unguessable; there is no list-all route | Real version: merchant login | Next step |
| R-S5 | A secret leaks | Never in the repo (`.env*.local` ignored); only the public client ID reaches the browser | Rotate the Secret in the PayPal dashboard, update Render, redeploy | Process |
| R-S6 | Sandbox logins or the judge account stop working | Judges cannot test | Rebuild from `docs/sandbox-runbook.md`; weekly judge-login check (A-31) | Process |

## Channel3 live prices (D)

Added 5 Nov 2026 by D, against the plan in `docs/channel3.md`. Live prices only run when `LIVE_PRICES=1`; with `LIVE_PRICES=0` (the default) every price comes from `data/catalogue.json`. **Planned** = agreed in `docs/channel3.md` but not yet merged; each says which Friday test (D-C5, Fri 6 Nov) checks it. Change it to Built once that test passes.

| ID | Risk | What happens now | Alternative / next step | Status |
|---|---|---|---|---|
| R-C1 | Channel3 is down, slow, or the key is wrong | Each lookup falls back to the fixed catalogue price (`price_usd`), shown as "price checked {date}"; the bundle still builds and nothing crashes | Verify with a wrong key (D-C5 test B) | Built (test B passed 9 Nov) |
| R-C2 | Channel3 credits run out | The app only uses lookups (`GET /products/{id}`), which are free; only `/search` costs 1 credit, and the app never calls it | Check the Channel3 dashboard balance weekly until 15 Dec (D-31) | Process (D) |
| R-C3 | The live price changes between the video and judging, so judges see a different total | The video's main flow is recorded with `LIVE_PRICES=0` ($871.19) | The Devpost testing note says prices are live and may differ from the video | Process (D) |
| R-C4 | A listing goes out of stock, used-only, or changes | Used and out-of-stock offers are never shown; that product falls back to its fixed price | Check the mapping during the weekly judging check (D-31) | Planned (re-test after the variants fix) |
| R-C5 | The wrong Channel3 listing is linked to a product | Each `channel3_id` was hand-picked and tested: 22 of 23 mapped, 115/115 lookups repeatable; SM58-LC and SM58S have separate IDs; `stand-psa1` has none and always uses its fixed price | Spot-check 3 products against retailer pages (D-C5 test E) | Built (data); re-test after the variants fix |
| R-C6 | The Channel3 key leaks | Only in `.env.local` (ignored by git) and Render's environment variables; never in the repo, the group chat or a shared doc | Create a new key in the Channel3 dashboard, delete the old one, update the builder's `.env.local` and Render, redeploy | Process (D) |
| R-C7 | A live price changes which product is cheapest, so the demo bundle changes | Depends on whether the cheapest-first order uses `price_usd` or the live price (question open with B) | If it uses the live price: sort on `price_usd` and only display the live price, so the bundle never changes | Built: `bundle.ts` sorts on `price_usd`; the live price is display and charge only (B, 9 Nov) |
| R-C8 | Channel3's price for a listing is out of date, so we show more (or less) than the retailer charges | Found 9 Nov: Macy's marketplace listings for the SM7B ($439 vs $369 on the page) and ATH-M50x ($179 vs $159). The code reads the current price (`price.price`), so the stale value is in Channel3's data | Keep `LIVE_PRICES=0` for judges unless re-tests pass; if switched on, always show the retailer and checked time, and never call it real-time | Open (D) |

## What C changed for these rows (done 6 Nov)

1. Both pages show the API's `message` for `paypal_error`, `release_failed`, `paypal_unreachable`, `payment_pending` and `still_processing`; Finish stays available and reads "Try Finish again" after a failure.
2. `capture_uncertain: true` shows "Being confirmed" with "Do not ship yet" on the merchant console, and "PayPal is confirming whether this part was charged" to the shopper. The ledger keeps unconfirmed money apart from parts that won't be charged.
3. R-M1 and R-M2 are kept: a blocked line with a check left can be rechecked, `cancel_reason` is shown on both pages, and "Can't fulfil this part" calls `POST /api/cancel-line`.
4. "Start over" reads the reset reply: if PayPal could not confirm the release, the shopper is told the hold is released automatically within 24 h.
5. (12 Nov) A page refresh keeps the shopper's bundle and order: the bundle and the order id are saved in the browser (`lib/session.ts`, `localStorage`, 24 h) and the order is read back from the server. A server restart (R-S1) still shows "order expired".
