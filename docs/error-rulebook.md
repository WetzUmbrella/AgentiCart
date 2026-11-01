# Error rulebook (owner: A)

One rule runs through every row: **if anything is unsure, nothing is charged, and nothing is called "released" until PayPal confirms it.** The AI never moves money; it returns a verdict, and code in `lib/orders.ts` decides.

Line states: `AUTHORISED` (held, not charged) → `SHIPPED` (being checked, locked) → `CAPTURED` (charged) or `NOT_CHARGED` (blocked) or `CAPTURE_FAILED` (PayPal did not charge). At close, unused holds become `VOIDED` (released).

Checked against: `feat/a-payments` (A), `origin/c-frontend` 45d1d4c (label photo, Cheston's `lib/ai.ts`), `origin/ahsanul` 6ae5057 (Ahsanul's `lib/ai.ts`). Written 31 Oct 2026.

## 1. AI fails during the ship check

Applies to the label-photo read (Gemini Flash). Every row here is thrown **after** the line is claimed, so the same recovery applies: the line goes back to its previous state, the check is not counted, the photo is deleted, and the merchant can try again.

| # | Failure | What the system does | Line state after | Merchant sees | Shopper sees | Status |
|---|---|---|---|---|---|---|
| 1 | Gemini times out (Pro 90 s, Flash 45 s) | No retry. 504 `ai_timeout` | Previous state (`AUTHORISED`, or `NOT_CHARGED` if this was the repack) | "The AI took too long to answer. Nothing was charged. Try again." | Part still held, not charged | c-frontend only |
| 2 | Gemini busy (503, "high demand") | Retries, then 503 `ai_busy` | Previous state | "...busy. Nothing was charged. Try again in a minute." | Held, not charged | Both branches, **retry count differs** (see D1) |
| 3 | Gemini quota or rate limit (429) | No retry | Previous state | Quota / rate-limit message | Held, not charged | Both branches, **code differs** (see D2) |
| 4 | Our own daily AI cap reached | 429 `ai_daily_cap` before calling Google | Previous state | "The demo has used its AI budget for today." | Held, not charged | main |
| 5 | Gemini returns empty or malformed JSON | 502 `ai_empty` / `ai_bad_json` | Previous state | "The AI returned no answer / malformed JSON. Nothing was charged." | Held, not charged | main |

## 2. Label photo problems

| # | Failure | What the system does | Line state after | Merchant sees | Shopper sees | Status |
|---|---|---|---|---|---|---|
| 6 | No photo, wrong type, bad data, or file is not really that image type (magic bytes) | 400 `photo_required` / `bad_photo`. Rejected **before** the line is claimed | Unchanged, check not counted | "Add a photo of the box label..." / "Use a JPEG, PNG or WebP photo." / "The file is not a valid image of that type." | Nothing changes | c-frontend |
| 7 | Photo over 1.5 MB | 413 `photo_too_large`, before claim | Unchanged | "Use one under 1.5 MB." | Nothing changes | c-frontend |
| 8 | Label unreadable (`legible: false`) | Verdict = do not charge | `NOT_CHARGED`, **counts as check 1 of 2** (see D3) | "The model on the label photo could not be read. Not charged; retake the photo." | Part blocked, not charged | c-frontend + A |
| 9 | Wrong variant (label, typed model, or AI disagrees) | Do not charge. One repack allowed | `NOT_CHARGED`; second mismatch cancels the line, released at close | The exact reason, e.g. "The label in the photo reads SM58S, not the verified part SM58-LC." | Part blocked, not charged | c-frontend + A |

## 3. PayPal fails when charging a part

| # | Failure | What the system does | Line state after | Merchant sees | Shopper sees | Status |
|---|---|---|---|---|---|---|
| 10 | PayPal clearly refuses (e.g. `AUTHORIZATION_EXPIRED`, `AUTHORIZATION_VOIDED`) | No retry; no money moved | `CAPTURE_FAILED` | "PayPal refused the charge (ISSUE). Do not ship." | Not charged | A |
| 11 | Capture reply lost (timeout, 5xx) or `DUPLICATE_INVOICE_ID` | Retried once with the same `PayPal-Request-Id`, then looked up in PayPal's order record by `invoice_id`. Found = charged. Not found = unsure | `CAPTURED` if found; else `CAPTURE_FAILED` + `capture_uncertain` | Found: normal. Unsure: "PayPal did not confirm this charge. Do not ship yet." | Charged, or "being confirmed" | A |
| 12 | Capture comes back `PENDING` | Treated as unsure | `CAPTURE_FAILED` + `capture_uncertain`; Finish refuses (409 `payment_pending`) until PayPal settles | "Do not ship yet." | Being confirmed | A |
| 13 | Double click on Ship, or two merchants shipping the same line | Line locked as `SHIPPED` before any wait; PayPal dedupes on `PayPal-Request-Id: cap-<order>-<line>` | Second request gets 409 `line_not_authorised` | Second click is refused (409 `line_not_authorised`); C to word it | Charged once | A (sandbox screenshot still owed) |

## 4. Holds and closing the order

| # | Failure | What the system does | Line state after | Merchant sees | Shopper sees | Status |
|---|---|---|---|---|---|---|
| 14 | Hold not created (authorisation status not `CREATED`) | ID kept so close can release it; line can never be charged | `IN_BUNDLE` | "PayPal has not confirmed the hold. This part cannot be charged." | Not charged | A |
| 15 | Hold ages out. PayPal honours a hold for about 3 days; after that a capture may be refused; it is dead at day 29 | Auto-close voids every open order at **24 h**, so a demo order never reaches day 3. A late capture that PayPal refuses falls into row 10 | `VOIDED` after auto-close | Nothing to ship | Released | A. **Reauthorisation (days 4 to 29) not built** |
| 16 | Void fails at Finish, or its reply is lost | PayPal's record decides. Confirmed voids are kept; anything unconfirmed keeps the order open | Confirmed lines `VOIDED`; order stays open | "PayPal did not confirm that the held money was released, so the order is still open. Nothing extra was charged. Press Finish again." | Still held | A; auto-close retries every sweep |
| 17 | PayPal unreachable at Finish while a charge is unsure | Releases nothing | Unchanged | "Could not confirm a charge with PayPal, so nothing has been released yet. Try Finish again in a minute." | Still held | A |
| 18 | Server restarts (orders and photos live in memory) | All order records and label photos are lost. **Holds at PayPal are not voided**; they lapse on their own | Gone | Order not found | Hold sits on the card until PayPal drops it | Known limit. Before the demo: Finish every test order before redeploying |

## Decisions the team needs to make

**D1. Busy retries.** Ahsanul retries a 503 twice (waits 2 s then 4 s). Cheston retries once after 3 s. Proposal: Cheston's single retry, because the ship check runs while a merchant waits, and Flash already has a 45 s timeout. Owner: Ahsanul and Cheston, when `lib/ai.ts` is merged.

**D2. Quota error code.** Ahsanul returns 503 `ai_quota`; Cheston returns 429 `ai_rate_limited` with a separate free-tier message. Proposal: Cheston's (429 is the honest status, and the free-tier message is useful when someone forgets billing). The UI must match on one code.

**D3. Does an unreadable photo use up the repack?** Today yes: `legible: false` becomes `NOT_CHARGED` and counts as check 1 of 2, so a blurry photo followed by a wrong part cancels the line. Proposal: an unreadable label should not count, because it says nothing about what was packed. Small change in `shipLine`; needs Cheston's agreement since it touches his rule.

**D4. Which state after a failed label check.** Cheston's code returns the line to `AUTHORISED`; mine returns it to its previous state. They differ only on the repack: `AUTHORISED` would give the merchant a fresh pair of checks after a wrong variant. Merged version uses the previous state.

**D5. Evidence on repack.** The second photo overwrites the first, so the photo of the wrong variant is lost. Fine for the demo; worth keeping both if we claim "evidence" on a slide.
