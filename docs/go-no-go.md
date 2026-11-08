# Go/no-go results (due Sat 24 Oct, decided Sun 25 Oct)

Each script prints a ready-made row for this table. Run them with `PAYPAL_MODE=sandbox` credentials in `.env.local`.

| # | Test | Script | Owner | Result | Evidence |
|---|---|---|---|---|---|
| 1 | One approval, two payees; capture, tracking and void on **each** authorisation | `npm run gonogo:multi` | A | **Skipped** | Not needed: the team chose one seller on 21 Oct (one purchase unit, one authorisation). |
| 2 | Two partial captures on one authorisation, then void (records whether void works after partial captures) | `npm run gonogo:capture` | A | **PASS** (30 Oct) | Auth `7T994099M6683364E` for $150.00. Captures `27D80728C62264142` $50.00 and `64T72413H0595332B` $30.00, both COMPLETED with `final_capture: false`. Void after the partial captures succeeded; a GET on the authorisation returns `VOIDED`. Seller net $76.68 after sandbox fees ($2.00 + $1.32). |
| 3 | Tracking on a capture | `npm run gonogo:tracking` | A | **PASS** (30 Oct) | Order `5JG93982880985218`, capture `6MN32992UA889872W`: tracking `DEMO123` accepted by PayPal. |
| 4 | Audit on the 5 seed cases: at least 4/5 correct with real quotes; record seconds per call | `npm run testset -- data/seed.json` | B | **PASS** (2 Nov) | 5/5 correct on `gemini-3.1-pro-preview`, every verdict cites spec-sheet quotes from both parts. 7.7 to 11.0 s per call, mean 8.5 s. Dev run on seed cases only; not the published score. |
| 5 | Agent Toolkit fit | Read `@paypal/agent-toolkit` source | A/B | **Dropped** (2 Nov) | The review found `create_order` hard-codes `intent: 'CAPTURE'`. The app does not use the toolkit. |

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
- Builder: **Ahsanul**. `lib/channel3.ts` is in PR `feat/channel3`, 143/143 tests passing. `livePrice(product)` returns `{ price_usd, source: "live" | "fixed", retailer?, checked_at }`; `checked_at` is an ISO time for live prices and `price_date` for fixed ones.
- Product choice stays on the **fixed price**: `bundle.ts` keeps sorting on `price_usd`, and the live price is used only for what's shown and charged, so live prices can never change which products are picked.
- `LIVE_PRICES` defaults to **0**, so nothing changes until it's switched on. Whether it goes on for the judges depends on Des's live-price tests (below).
- Open: whether the charge uses the price saved at checkout (asked of Yi Heng), and whether "Channel3" can be named on screen (organisers' reply pending).