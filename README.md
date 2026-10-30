# AgentCart

**Approve once. Pay only for parts confirmed to fit.**

AgentCart builds a compatible gear bundle (for example a two-person podcast setup) by reading the manufacturers' spec sheets with AI. You approve the whole bundle once with PayPal, and the money is **authorised, not charged**. Each part is **charged only when the AI confirms that the model being shipped is the exact part it verified**. A part that doesn't match is never charged, and the rest of the hold is released when the order is finished.

Built for the PayPal AI Hackathon.

## Try it

- Hosted demo: `[Render URL]`
- Log in to the PayPal popup with the judge sandbox account: `[judge email]` / `[judge password]`
- The first load can take about a minute if the free server was asleep.
- Type a goal (the default is "Podcast setup for 2 people under $900") and press **Build my bundle**.
- Approve with PayPal, then open the **merchant console** from the link on the page and ship parts. Try `SM58S` for the Shure line to see a part that is not charged.
- Press **Finish order** to release the rest of the hold. **Start over** clears only your own order.

## How it works

1. **Goal in.** Gemini Flash turns the goal into constraints (people, budget, which parts are needed).
2. **Parts from a real catalogue.** Candidates always come from `data/catalogue.json`. The AI never invents products.
3. **Compatibility audit.** For each part, Gemini Pro reads the attached spec sheets and checks it against the parts already chosen: connectors, phantom power, mic inputs, mount threads. Every verdict quotes the spec sheet. Parts are checked in a fixed order (interface, microphones, cables, stands, headphones), cheapest first, so results are repeatable.
4. **Edit.** The bundle is shown in an AG Grid table. Swap re-checks that row only.
5. **Approve once.** PayPal Orders v2 with `intent: AUTHORIZE`. Nothing is charged.
6. **Merchant ships.** The merchant enters the exact model and a tracking number.
7. **Per-part decision.** A part is captured only if two keys agree: an exact or AI-confirmed match, **and** a code check that the merchant's text contains the verified variant. Otherwise it is never charged.
8. **Close.** Remaining authorisations are voided.

```
Shopper page (Next.js + AG Grid + PayPal button)      Merchant console (/merchant?order=…)
          │ goal, swap, approve                                │ shipped model + tracking
          ▼                                                    ▼
                    Next.js API routes (server only)
  /api/bundle ─► Gemini Flash (constraints) + catalogue + audit (Gemini Pro, spec sheets attached)
  /api/audit  ─► audit one swapped row
  /api/orders, /authorize ─► PayPal Orders v2 (AUTHORIZE)
  /api/ship   ─► exact match → else Gemini Flash + variant check
                 ├─ CAPTURE        ─► capture that line + add tracking
                 └─ DO_NOT_CAPTURE ─► no PayPal call at all
  /api/orders/:id/close ─► void what is still held
  /api/paypal/webhook   ◄─ PayPal events (signature verified)
```

### Why this isn't a sponsored recommendation site

- **No paid placement.** In each category the cheapest part that passes the check wins. Every bundle comes with a receipt listing each catalogue product considered and what happened to it: picked, failed the check, ruled out by its listing, or not needed because a cheaper part already fit (`lib/bundle.ts`).
- **Reasons you can check.** Every evidence quote is looked up in the spec sheet's own text (PDFs) and linked to the manufacturer's page. Quotes from image spec sheets are marked "not auto-checked", never "found" (`lib/trust.ts`).
- **Confidence from checks, not self-rating.** Each verdict gets high, medium or low from three signals: quotes found in the sheet, agreement with our hand-checked `key_specs` (which the AI never sees), and the AI's own rating, which can lower the level but never raise it. No percentages. A **low** part is left out of the PayPal approval until the shopper keeps it or swaps it.
- **The seller is paid only for verified parts.** An ad site is paid on the click. Here PayPal holds the money and each part is captured only after its shipped model matches the part that was checked.

**The AI cannot move money.** It has no PayPal access. It returns JSON; only `lib/orders.ts` calls capture or void, and only after a verified match.

## PayPal APIs used

| API | Endpoint | Used for |
|---|---|---|
| OAuth | `POST /v1/oauth2/token` | Access token, cached and refreshed before expiry |
| Orders v2 | `POST /v2/checkout/orders` (`intent: AUTHORIZE`) | One approval for the bundle |
| Orders v2 | `POST /v2/checkout/orders/{id}/authorize` | Hold the money after approval |
| Payments v2 | `POST /v2/payments/authorizations/{id}/capture` | Charge one confirmed line (partial capture) |
| Payments v2 | `POST /v2/payments/authorizations/{id}/void` | Release what was never confirmed |
| Orders v2 | `POST /v2/checkout/orders/{id}/track` | Attach tracking to the capture |
| Webhooks | `POST /v1/notifications/verify-webhook-signature` | Trust only real PayPal events |
| JS SDK | `@paypal/react-paypal-js` with `intent: authorize` | The approval popup |

Every money call sends a `PayPal-Request-Id` built from the order and line (for example `cap-<order>-<line>`), so a retried request reuses the same key. A line can only be shipped while it is held, so a double click or a re-ship cannot charge twice.

The PayPal Agent Toolkit is **not** used: its `create_order` tool creates capture-intent orders, and this product depends on authorise-then-capture.

## What's real and what isn't

| Component | Status |
|---|---|
| PayPal authorise, capture, void, tracking, webhooks | Real, PayPal sandbox |
| Compatibility audit | Real AI over real manufacturer spec sheets |
| Shipped-model check | Exact-match code, then Gemini Flash, plus a deterministic variant check |
| Product catalogue | Curated: real products, prices checked on the date shown for each |
| Merchants | Sandbox accounts operated by the team through the merchant console |

Not built and not claimed: live retailer stock, multi-retailer search, real merchant fulfilment.

## Accuracy

`[X]/20` on hand-checked pairings of real spec sheets. Results: `results/testset-YYYY-MM-DD.txt`. The 20 cases were written before the AI was run on them and are separate from the 5 development cases in `data/seed.json`.

## Run it locally

Requires Node.js 20 or newer.

```bash
git clone https://github.com/<team>/agentcart.git
cd agentcart
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. With the defaults (`PAYPAL_MODE=mock`, `AI_MODE=mock`) everything runs without accounts, and the header shows **Mock PayPal** and **Mock AI**. Mock mode is for building the UI only: the mock AI reads hand-filled test data, never the spec sheets.

For the real flow, set in `.env.local` (names only here, never commit values):

- `PAYPAL_MODE=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`
- `AI_MODE=live`, `GEMINI_API_KEY`, `GEMINI_MODEL_PRO`, `GEMINI_MODEL_FLASH`
- Optional: `GEMINI_THINKING_LEVEL=LOW`, `MAX_AI_CALLS_PER_DAY`, `PAYPAL_MULTI_MERCHANT=1` with `MERCHANT_A/B/C_EMAIL`

Spec sheets: `npm run fetch-specs` downloads the PDFs that have a direct link and lists the official pages to screenshot into `data/specs/`.

## Scripts

| Command | What it does |
|---|---|
| `npm test` | Unit tests for the money flow, shipped-model rules and bundle builder |
| `npm run typecheck` | TypeScript check |
| `npm run check-catalogue` | Validates the catalogue and lists missing spec files |
| `npm run fetch-specs` | Downloads spec PDFs |
| `npm run gonogo:capture` / `gonogo:multi` / `gonogo:tracking` | Go/no-go tests against the real sandbox (interactive) |
| `npm run test-ship` | The five shipped-model cases |
| `npm run testset` | Accuracy run on `data/testset.json` (live AI only) |
| `npm run check-quotes` | Checks that the demo's evidence quotes appear in the PDFs |
| `npm run warm -- <url>` | Wakes the hosted demo and warms the verdict cache |

## Deploy on Render

New → Web Service → this repo. Build `npm install && npm run build`, start `npm start`. Add the environment variables above, then register the webhook (`docs/sandbox-runbook.md`). The free tier sleeps after 15 minutes and can restart at any time; orders live in memory, so a restart clears them and the UI says so.

## Production notes

- **Honour period.** PayPal guarantees captures for a limited time after authorising (about 3 days). The demo captures the same day; in production, long shipping times need reauthorisation.
- **A merchant could type the right model and ship the wrong one.** That is fraud, and PayPal buyer protection and disputes still apply. AgentCart stops honest mistakes and substitutions, which are the common case.
- **Multi-merchant.** One approval paying several sellers depends on PayPal's multi-seller rules; see `docs/go-no-go.md`. The default build pays one platform account.

## Licence

MIT for the code. Spec sheets in `data/specs/` are third-party material and are not covered; see `data/NOTICE.md`.
