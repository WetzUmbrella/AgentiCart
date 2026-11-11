# Go/no-go results (due Sat 24 Oct, decided Sun 25 Oct)

Each script prints a ready-made row for this table. Run them with `PAYPAL_MODE=sandbox` credentials in `.env.local`.

| # | Test | Script | Owner | Result | Evidence |
|---|---|---|---|---|---|
| 1 | One approval, two payees; capture, tracking and void on **each** authorisation | `npm run gonogo:multi` | A | **Skipped** | Not needed: the team chose one seller on 21 Oct (one purchase unit, one authorisation). |
| 2 | Two partial captures on one authorisation, then void (records whether void works after partial captures) | `npm run gonogo:capture` | A | **PASS** (30 Oct) | Auth `7T994099M6683364E` for $150.00. Captures `27D80728C62264142` $50.00 and `64T72413H0595332B` $30.00, both COMPLETED with `final_capture: false`. Void after the partial captures succeeded; a GET on the authorisation returns `VOIDED`. Seller net $76.68 after sandbox fees ($2.00 + $1.32). |
| 3 | Tracking on a capture | `npm run gonogo:tracking` | A | **PASS** (30 Oct) | Order `5JG93982880985218`, capture `6MN32992UA889872W`: tracking `DEMO123` accepted by PayPal. |
| 4 | Audit on the 5 seed cases: at least 4/5 correct with real quotes; record seconds per call | `npm run testset -- data/seed.json` | B | **PASS** (2 Nov) | 5/5 correct on `gemini-3.1-pro-preview`, every verdict cites spec-sheet quotes from both parts. 7.7 to 11.0 s per call, mean 8.5 s. Dev run on seed cases only; not the published score. |
| 5 | Agent Toolkit fit | Read `@paypal/agent-toolkit` source | A/B | **Dropped** (2 Nov) | The review found `create_order` hard-codes `intent: 'CAPTURE'`. The app does not use the toolkit. |

## Sandbox money-path run (Thu 12 Nov, A)

`npx tsx scripts/sandbox-money-path.mts` checks, once each, what `lib/paypal-mock.ts` assumes about real PayPal. Two orders, each approved once as the sandbox shopper. Order B is kept apart so a stray charge from a probe can't use up A's hold.

- Order A `9WC24662Y7928940Y`, auth `7WJ00824GW7730801`, $100.00 (L1 $50.00, L2 $30.00, L3 $20.00). Captures `7FA24046RS6677621` $50.00 and `93767284AY8768611` $30.00.
- Order B `34J556335D5584003`, auth `98J78829UD2639104`, $20.00. Capture `4XV56194HP916245T` $10.00, then the probe capture `4GD71596S4470383J` $10.01.

| Check | Mock assumes | Real PayPal | Verdict |
|---|---|---|---|
| A1 Auth after one partial capture | `PARTIALLY_CAPTURED` | `PARTIALLY_CAPTURED` | Mock right |
| A2 Capture on an expired auth (`PayPal-Mock-Response`) | Not modelled; app needs a clear refusal | 422 `AUTHORIZATION_EXPIRED`, not uncertain | Mock right |
| A3 Void after partial captures | Succeeds | Succeeds | Mock right |
| A4 Auth after void | `VOIDED` | `VOIDED` | Mock right |
| A5 Capture after void | 422 `AUTHORIZATION_VOIDED` | 422 `AUTHORIZATION_VOIDED` | Mock right |
| A6 Void twice | 422 `PREVIOUSLY_VOIDED` | 422 `PREVIOUSLY_VOIDED`; auth still reads `VOIDED` | Mock right |
| A7 `invoice_id` on captures in PayPal's order record (R-P3) | Present | `<orderId>-L1` and `<orderId>-L2` both found | Mock right |
| A8 `reconcile` v2 against PayPal's record | PASS, settled | PASS, settled, `MATCHED`; $100.00 held = $80.00 charged + $20.00 released; amount checks ran (2/2 captures, auth $100.00) | Mock right |
| B1 Reused `invoice_id`, new `PayPal-Request-Id` | 422 `DUPLICATE_INVOICE_ID` | 422 `DUPLICATE_TRANSACTION` | **Mock wrong** |
| B2 Capture 1 cent over what is left | 422 `MAX_CAPTURE_AMOUNT_EXCEEDED` | Accepted: B charged $20.01 on a $20.00 auth | **Mock wrong** |

What changed because of B:

- **B1 was a real bug, now fixed.** `orders.ts` only treated `DUPLICATE_INVOICE_ID` as "may already be charged", so `DUPLICATE_TRANSACTION` would have been read as a clear refusal and the line marked "Do not ship" although PayPal had charged it. It now goes to the `invoice_id` lookup like a timeout. The mock returns the real code, and a new test checks the line ends CAPTURED, charged once. Reaching this in the app needs the same `invoice_id` with a different request ID; the app always sends `cap-<order>-<line>` for a line, so it should not happen in practice.
- **B2 needs no code change.** PayPal is no backstop against over-capture. The app only ever captures `line.amount_cents`, fixed at order creation, and the lines add up to the authorisation; the line lock and per-line request ID stop a second capture. The mock still refuses over-capture on purpose, so tests catch it if our code ever tries.
- Nothing left held: A was voided; B's authorisation is `CAPTURED`, so its cleanup void was refused with `PREVIOUSLY_CAPTURED`.
- `reconcile` ran on a hand-built closed order made from A's real IDs, so it tests the comparison with PayPal, not the app's own close. A full run through the app is still owed (H17).
- Approval: the PayPal page keeps spinning after the final click, likely because the order has no return URL (not verified). The approval still registers; the script reads it from PayPal instead of waiting for Enter.

## Decisions
Confirmed by A, B and C by message, 5 to 9 Nov (no call).

- Single or multi-merchant: **single** (test 1 skipped, single seller; decided 21 Oct). Every capture goes to one PayPal account. The multi-merchant code exists but is off (`PAYPAL_MULTI_MERCHANT` unset).
- How close releases money: **void**. Finish, or the 24 h auto-close, voids every authorisation still holding uncaptured money. If the void reply is lost, the code reads the authorisation back from PayPal and only closes the order once PayPal shows `VOIDED`; otherwise the order stays open and Finish can be pressed again. Test 2 showed a void works after partial captures.
- Toolkit: **dropped**. `create_order` hard-codes `intent: 'CAPTURE'`, but the app needs `AUTHORIZE` for per-part capture.
- Test 4 accuracy: **5/5, no narrowing** of product types.
- Paid Gemini account: **Ahsanul** owns it. Monthly cap **$___**, plus a requests-per-minute quota (Google's budget only sends alerts; the quota is what stops spending).
- Forum threads: **cut**. Nothing in the app reads them; removed from PLAYBOOK.
- Render hosting: **Des**, Yi Heng backup. `PAYPAL_MODE=sandbox` exactly; `PAYPAL_API_BASE` and `PAYPAL_MULTI_MERCHANT` left unset.
- PayPal webhook: **skipped**. Webhooks are only logged and never change an order or move money, so the demo doesn't need one.

## Final pitch wording
> Approve once. Pay only for parts that fit, when they ship.

## Channel3 (tested 4 Nov, Des)

| Test | Script | Result | Evidence |
|---|---|---|---|
| Live sourcing: search finds the exact variant for our 23 products | `scripts/channel3-probe.mjs` | **FAIL** | Exact variant first for 13 to 15 of 23 (pass mark 18). The SM58-LC and SM58S came back as the same listing. About a quarter of category results had no model name or were off-target. 3 of 5 category searches repeatable. |
| Live prices: look up a hand-picked product ID | `scripts/channel3-lookup.mjs` | **PASS** | 115/115 lookups worked, 23/23 the same on repeat, about 0.44 s each, free. Variants have their own IDs (SM58 "Standard" `a8ibawf`, "with On/Off Switch" `997Bp2Z`). 22 of 23 products mapped by hand. |

- Decision: **no live sourcing** (next-steps slide). **Live prices on the curated catalogue**, agreed 4 Nov. Rules and roles in `docs/channel3.md`.
- Builder: **Ahsanul**. `lib/channel3.ts` merged into main (PR #4, 6 Nov), 143/143 tests passing. `livePrice(product)` returns `{ price_usd, source: "live" | "fixed", retailer?, checked_at }`; `checked_at` is an ISO time for live prices and `price_date` for fixed ones.
- Product choice stays on the **fixed price**: `bundle.ts` keeps sorting on `price_usd`, and the live price is used only for what's shown and charged, so live prices can never change which products are picked.
- `LIVE_PRICES` defaults to **0**, so nothing changes until it's switched on. As of 9 Nov nothing in the app calls `livePrice()` yet: the price cell (C) and orders (A) still use `price_usd`.
- Answered 10 Nov (A): the charge never reads a live price. `createOrder` stores each line's amount from the catalogue `price_usd`, and the capture in `shipLine` charges that stored amount, so a price rise after approval can't push a capture over the hold.
- Open: whether "Channel3" can be named on screen (organisers' reply pending).

### Channel3 live-price test (Mon 9 Nov, Des)
Run on main's `lib/channel3.ts` by calling `livePrice()` for all 23 catalogue products with `LIVE_PRICES=1`, because the screens don't use live prices yet.

- A. Live price, retailer and time for every mapped product: **FAIL**. 19 of 22 mapped products returned `live` with a retailer and ISO time; `stand-psa1` correctly `fixed`. `mic-sm58lc`, `mic-sm58s` and `cable-mogami-trs10` fell back with `listing.variants?.find is not a function`. Cause: Channel3 returns `variants` as an object (`{ options, selected }`), not an array. Fix with tests sent to Ahsanul (`offersFor` checks `Array.isArray`); 145/145 tests pass with it.
- B. Wrong key, every product falls back to its fixed price, no crash: **PASS**. All 23 `fixed`.
- C. LIVE_PRICES=0, demo total $871.19 three runs in a row: **not run yet** (needs the real AI on Render).
- D. Screen total equals the PayPal sandbox popup: **not run yet** (needs live prices wired into orders and the price cell).
- E. 3 retailer spot-checks: **FAIL**. `if-2i2-4` Macy's $224 matches. `mic-sm7b`: we got $439, Macy's charges $369 ($439 is the crossed-out price). `hp-m50x`: we got $179, Macy's charges $159 (Black). Both are marketplace listings (sold by Electronics Expo), new and in stock. The code reads Channel3's current price (`price.price`, not `compare_at_price`), so Channel3's own data for these listings is out of date; no code fix on our side.
- Verdict: **LIVE_PRICES stays 0** until the variants fix is merged, live prices are wired into the screen and orders, and A and E are re-run. If it goes on, every live price must show its retailer and checked time, and nothing public may call it real-time.