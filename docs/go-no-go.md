# Go/no-go results (due Sat 24 Oct, decided Sun 25 Oct)

Each script prints a ready-made row for this table. Run them with `PAYPAL_MODE=sandbox` credentials in `.env.local`.

| # | Test | Script | Owner | Result | Evidence |
|---|---|---|---|---|---|
| 1 | One approval, two payees; capture, tracking and void on **each** authorisation | `npm run gonogo:multi` | A | **Skipped** | Not needed: the team chose one seller on 21 Oct (one purchase unit, one authorisation). |
| 2 | Two partial captures on one authorisation, then void (records whether void works after partial captures) | `npm run gonogo:capture` | A | **PASS** (30 Oct) | Auth `7T994099M6683364E` for $150.00. Captures `27D80728C62264142` $50.00 and `64T72413H0595332B` $30.00, both COMPLETED with `final_capture: false`. Void after the partial captures succeeded; a GET on the authorisation returns `VOIDED`. Seller net $76.68 after sandbox fees ($2.00 + $1.32). |
| 3 | Tracking on a capture | `npm run gonogo:tracking` | A | **PASS** (30 Oct) | Order `5JG93982880985218`, capture `6MN32992UA889872W`: tracking `DEMO123` accepted by PayPal. |
| 4 | Audit on the 5 seed cases: at least 4/5 correct with real quotes; record seconds per call | `npm run testset -- data/seed.json` | B | | |
| 5 | Agent Toolkit fit | Read `@paypal/agent-toolkit` source | A/B | | The review found `create_order` hard-codes `intent: 'CAPTURE'`. The app does not use the toolkit. |

## Decisions (fill in on Sun 25 Oct)
- Single or multi-merchant: **single** (decided 21 Oct; `PAYPAL_MULTI_MERCHANT=0`).
- How close releases money: **void**. Test 2 showed a void works after partial captures, so `closeOrder` stays as written.
- Toolkit: dropped (default) or scoped task

## Final pitch wording
>
