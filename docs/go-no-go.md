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
- `reconcile` ran on a hand-built closed order made from A's real IDs, so it tests the comparison with PayPal, not the app's own close. The full run through the app is H17, below.
- Approval: the PayPal page keeps spinning after the final click, likely because the order has no return URL (not verified). The approval still registers; the script reads it from PayPal instead of waiting for Enter.

## H17: full sandbox run through the app (Thu 12 Nov, A)

Local `npm run dev` on `feat/a-sandbox` at `992bb67` (main `af6322b` + PR #7), `PAYPAL_MODE=sandbox`, `AI_MODE=mock`, single merchant. Same sandbox app and accounts as Render. One approval in the PayPal popup as `shopper`; everything else through the shop page and merchant console, then read back with `reconcile` and `scripts/check-hold.mts`. Raw outputs in `docs/h17/`.

Order `9J09700723563923V`, auth `5DT48935FF0263118`, $871.19 (the demo bundle in `demo-bundle.md`).

| Line | Part | Amount | What was shipped | Result |
|---|---|---|---|---|
| line-1 | Scarlett 2i2 4th Gen | $224.99 | SM58S label, twice | Not charged, blocked (check 2 of 2) |
| line-2 | SM58-LC x2 | $218.00 | SM58S (wrong variant), blurry label (not counted), SM58-LC | Charged after one repack: capture `1L1240126X7592721`, tracking `DEMO1` accepted |
| line-3 | HMIC-010 x2 | $32.22 | Can't fulfil: Out of stock | Not charged |
| line-4 | Compass arm x2 | $199.98 | Scarlett label, then HMIC label | Not charged, blocked (check 2 of 2) |
| line-5 | MDR-7506 x2 | $196.00 | MDR-7506 label | Charged: capture `9ND27972HG429400A`, tracking `DEMO2` accepted |

| Check | Expected | Real | Verdict |
|---|---|---|---|
| H1 `POST /api/ship` again on a charged line (line-2) | Refused before PayPal | 409; no new event in the order log | PASS |
| H2 `POST /api/ship` on a twice-blocked line (line-1) | Refused before PayPal | 409; no new event | PASS |
| H3 `reconcile` before Finish | PASS, not settled; $414.00 charged, $457.19 still held | Exactly that, `MATCHED` (PayPal's status for a part-charged hold is one reconcile accepts) | PASS |
| H4 Finish | Void the rest, close | `VOIDED 5DT48935FF0263118`, `CLOSED`, $457.19 released | PASS |
| H5 `reconcile` after Finish | PASS, settled | PASS, settled, `MATCHED`: $871.19 held = $414.00 charged + $457.19 released | PASS |
| H6 `check-hold` (PayPal's own record) | 2 captures, auth voided | 2 COMPLETED captures, `invoice_id` `<order>-line-2` $218.00 and `<order>-line-5` $196.00, `final_capture: false`; auth `VOIDED`; NOTHING HELD | PASS |
| H7 Sandbox accounts | Business: 2 payments, $218.00 and $196.00 | Business Activity, read 12 Nov 19:35 SGT: `Payment from Doe John` $218.00 at 10:39 and $196.00 at 10:42. Other 12 Nov rows: `7U82…` x5, `7F95…` x3 (none for $218.00 / $32.22), money-path run x4. One authorisation, $871.19 at 10:16, `Voided` (likely `53T2…`). Shopper Activity, read 12 Nov 15:22 SGT: same 14 charges, no open hold from 12 Nov. PayPal shows a fee per row ($196.00 → $6.96 fee); `reconcile` checks the gross. Not ours: pending $375.01 authorisation of 31 Oct, `1AK30146LJ6018826`, expires on its own | PASS |

Second order, nothing shipped: `53T26603PA8320415`, auth `2XM18026NP773153J`, $871.19. Finish was pressed straight after approval: auth `VOIDED`, `reconcile` PASS, settled, `MATCHED`, $0.00 charged, $871.19 released; `check-hold` NOTHING HELD.

What the run showed:

- On real PayPal, two parts were charged (one after a repack) and three were not (two blocked twice, one out of stock). Nothing was charged twice, and every cent of the hold is placed in both our record and PayPal's.
- The run was meant to follow `e2e/demo.spec.ts` and drifted because of the merchant console, not the money path. A label is checked against whatever line the Part dropdown shows; after a wrong-part result the dropdown keeps that line selected and the button turns into Recheck (`app/merchant/page.tsx:89`, `:149`), and picking a sample label never changes the dropdown. Twice the next label went onto the line that had just failed. The money outcome was right each time (refused, released), but a real merchant would hit the same trap. Not changed before the deadline; for the video, set Part last, just before pressing the button.
- The shopper's sandbox balance is in SGD: the popup showed SGD 1,147.01 at 1 SGD = 0.75953 USD. The order, hold and captures are USD.
- The first approval created two PayPal orders (two `POST /api/orders` before one `authorize`). The unapproved one holds nothing. Cause not checked.
- Not covered: every line charged, so no void at close. `reconcile` then expects the authorisation `CAPTURED`, but every capture sends `final_capture: false` and the mock ignores that flag, so whether PayPal reports `CAPTURED` or `PARTIALLY_CAPTURED` was untested. Answered in H17b: `CAPTURED`.
- Mock AI, so this tests the money path, not label reading. Live AI with real PayPal gets a 5-minute check on Render after the final deploy.

## H17b: every part charged, and PayPal unreachable mid-run (Thu 12 Nov, A)

Same setup as H17, server restarted at 13:40 SGT after the laptop slept. Raw outputs in `docs/h17/b-*` (order `7F950519FN343042F`) and `docs/h17/c-*` (order `7U829600DK341205V`).

### Every part charged: `7U829600DK341205V`

Auth `2D1020590L814920C`, $871.19. All five lines shipped with their matching sample label and tracking `DEMO41` to `DEMO45`, 14:33:27 to 14:34:44 SGT. Each capture came back in 2 to 3 s.

| Check | Expected | Real | Verdict |
|---|---|---|---|
| C1 `check-hold` after the fifth capture, before Finish (`c-07`) | Auth `CAPTURED` | 5 COMPLETED captures: $224.99 + $218.00 + $32.22 + $199.98 + $196.00 = $871.19. Auth `CAPTURED` in both the order record and a direct read. NOTHING HELD | PASS |
| C2 Finish | Close with no void, since nothing is held | `CLOSED`, no `VOIDED` event, $0 released (`lib/orders.ts:379` skips a hold with nothing left) | PASS |
| C3 `reconcile` after Finish | PASS, settled | PASS, settled, `MATCHED`: $871.19 held = $871.19 charged + $0 released | PASS |
| C4 `check-hold` after Finish (`c-09`) | Same as C1 | Same as C1 | PASS |

What it showed:

- Every capture is sent with `final_capture: false` (`lib/orders.ts:278`), and PayPal still marked the authorisation `CAPTURED` once the captured total reached the authorised amount. `reconcile` expects exactly that (`lib/reconcile.ts:212`). No code change.
- PayPal's order record then shows `final_capture: true` on all five captures. On the part-charged orders (`9J09700723563923V`, `7F950519FN343042F`) the same field reads `false`. So in PayPal's record the field follows the authorisation's end state, not only what was sent. Unverified: the request body was not logged; "sent as false" rests on the code.
- The mock already derives the status from the amounts (`lib/paypal-mock.ts:129`), which matches what the sandbox did.

### PayPal unreachable on two captures: `7F950519FN343042F`

Auth `1W438326R9724651D`, $871.19. Planned as the every-part run; two captures got no answer from PayPal.

| Line | What happened |
|---|---|
| line-1 Scarlett $224.99 | Charged, `50511835AH265605C` |
| line-2 SM58-LC $218.00 | 13:57:35 SGT: the capture call took 22 s (20 s timeout and one retry with the same `PayPal-Request-Id`, `lib/paypal.ts:13`, `:19`). The lookup in PayPal's order record then failed too: `CAPTURE_UNCONFIRMED (PayPal unreachable)`. Console: "Being confirmed. Do not ship yet." |
| line-3 HMIC-010 $32.22 | Same, 13:58:42 SGT |
| line-4 Compass $199.98, line-5 MDR-7506 $196.00 | Charged at 14:00 in 2 to 3 s: `03N150475K185534W`, `8E758346J8480410N` |

| Check | Expected | Real | Verdict |
|---|---|---|---|
| R1 `check-hold` while unconfirmed (`b-05`, 14:02 and 14:16) | Only the captures we recorded, or the two missing ones | 3 COMPLETED captures (line-1, -4, -5), $620.97; auth `PARTIALLY_CAPTURED`, $250.22 held; nothing for line-2 or line-3 | PASS |
| R2 `reconcile` before Finish | UNKNOWN, never PASS | UNKNOWN, $250.22 unknown, both lines named; `MATCHED` | PASS |
| R3 Finish, 14:17:59 SGT | Ask PayPal again before releasing | `CONFIRMED_NOT_CHARGED` line-2 and line-3, `VOIDED 1W438326R9724651D`, `CLOSED` within 2 s. Console: "PayPal confirmed this part was never charged. Do not ship." and "Released $250.22 back to the shopper." | PASS |
| R4 `reconcile` after Finish | PASS, settled | PASS, settled, `MATCHED`: $871.19 = $620.97 charged + $250.22 released | PASS |
| R5 `check-hold` after Finish (`b-06`) | 3 captures, auth voided | 3 COMPLETED captures, auth `VOIDED`, NOTHING HELD | PASS |

What it showed:

- The unconfirmed-charge path (risk R-P3) ran against a real PayPal outage, not a forced error. The app called the two parts neither charged nor free until PayPal's own record answered, then released exactly the $250.22 that was never taken.
- A line whose charge is unconfirmed cannot be shipped again (`lib/ship-rules.ts:12`), so this order could not reach every part charged. A fresh order was used for that (above).
- Cause of the outage (13:57:35 to 13:59:17 SGT) not found: laptop network or the sandbox. If it happens in the live demo, the merchant waits about 22 s on that part and sees "Do not ship yet". The money stays right.
- On the finished console the two lines read "Charge failed" in red, which looks like an app error; the grey line under it is the real message. Caption it if the screenshot is used.
- `b-02-*`: the same order after approval, before shipping: hold `CREATED`, $871.19, expires 2026-12-11.

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