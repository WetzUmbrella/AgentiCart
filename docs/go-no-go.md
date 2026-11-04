# Go/no-go results (due Sat 24 Oct, decided Sun 25 Oct)

Each script prints a ready-made row for this table. Run them with `PAYPAL_MODE=sandbox` credentials in `.env.local`.

| # | Test | Script | Owner | Result | Evidence |
|---|---|---|---|---|---|
| 1 | One approval, two payees; capture, tracking and void on **each** authorisation | `npm run gonogo:multi` | A | **Skipped** | Not needed: the team chose one seller on 21 Oct (one purchase unit, one authorisation). |
| 2 | Two partial captures on one authorisation, then void (records whether void works after partial captures) | `npm run gonogo:capture` | A | **PASS** (30 Oct) | Auth `7T994099M6683364E` for $150.00. Captures `27D80728C62264142` $50.00 and `64T72413H0595332B` $30.00, both COMPLETED with `final_capture: false`. Void after the partial captures succeeded; a GET on the authorisation returns `VOIDED`. Seller net $76.68 after sandbox fees ($2.00 + $1.32). |
| 3 | Tracking on a capture | `npm run gonogo:tracking` | A | **PASS** (30 Oct) | Order `5JG93982880985218`, capture `6MN32992UA889872W`: tracking `DEMO123` accepted by PayPal. |
| 4 | Audit on the 5 seed cases: at least 4/5 correct with real quotes; record seconds per call | `npm run testset -- data/seed.json` | B | **PASS** (2 Nov) | 5/5 correct on `gemini-3.1-pro-preview`, every verdict cites spec-sheet quotes from both parts. 7.7 to 11.0 s per call, mean 8.5 s. Dev run on seed cases only; not the published score. |
| 5 | Agent Toolkit fit | Read `@paypal/agent-toolkit` source | A/B | **Dropped** (2 Nov) | The review found `create_order` hard-codes `intent: 'CAPTURE'`. The app does not use the toolkit. |

## Decisions (fill in on Sun 25 Oct)
- Single or multi-merchant: **single** (decided 21 Oct; `PAYPAL_MULTI_MERCHANT=0`).
- How close releases money: **void**. Test 2 showed a void works after partial captures, so `closeOrder` stays as written.
- Toolkit: **dropped**. `create_order` hard-codes `intent: 'CAPTURE'`, but the app needs `AUTHORIZE` for per-part capture.

## Final pitch wording
>

## Channel3 (tested 4 Nov, Des)

| Test | Script | Result | Evidence |
|---|---|---|---|
| Live sourcing: search finds the exact variant for our 23 products | `scripts/channel3-probe.mjs` | **FAIL** | Exact variant first for 13 to 15 of 23 (pass mark 18). The SM58-LC and SM58S came back as the same listing. About a quarter of category results had no model name or were off-target. 3 of 5 category searches repeatable. |
| Live prices: look up a hand-picked product ID | `scripts/channel3-lookup.mjs` | **PASS** | 115/115 lookups worked, 23/23 the same on repeat, about 0.44 s each, free. Variants have their own IDs (SM58 "Standard" `a8ibawf`, "with On/Off Switch" `997Bp2Z`). 22 of 23 products mapped by hand. |

- Decision: **no live sourcing** (next-steps slide). **Live prices on the curated catalogue**, agreed 4 Nov. Rules and roles in `docs/channel3.md`.
