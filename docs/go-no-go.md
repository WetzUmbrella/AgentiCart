# Go/no-go results (due Sat 24 Oct, decided Sun 25 Oct)

Each script prints a ready-made row for this table. Run them with `PAYPAL_MODE=sandbox` credentials in `.env.local`.

| # | Test | Script | Owner | Result | Evidence |
|---|---|---|---|---|---|
| 1 | One approval, two payees; capture, tracking and void on **each** authorisation | `npm run gonogo:multi` | A | | |
| 2 | Two partial captures on one authorisation, then void (records whether void works after partial captures) | `npm run gonogo:capture` | A | | |
| 3 | Tracking on a capture | `npm run gonogo:tracking` | A | | |
| 4 | Audit on the 5 seed cases: at least 4/5 correct with real quotes; record seconds per call | `npm run testset -- data/seed.json` | B | | |
| 5 | Agent Toolkit fit | Read `@paypal/agent-toolkit` source | A/B | | The review found `create_order` hard-codes `intent: 'CAPTURE'`. The app does not use the toolkit. |

## Decisions (fill in on Sun 25 Oct)
- Single or multi-merchant: (default single; set `PAYPAL_MULTI_MERCHANT=1` only if test 1 passes)
- How close releases money: void (default) or final capture
- Toolkit: dropped (default) or scoped task

## Final pitch wording
>
