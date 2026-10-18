# Demo bundle

Goal text: **Podcast setup for 2 people under $900**

With the current catalogue the builder produces (checked in mock mode; re-check in live mode):

| Line | Part | Qty | Amount |
|---|---|---|---|
| line-1 | Focusrite Scarlett 2i2 4th Gen | 1 | $224.99 |
| line-2 | Shure SM58-LC | 2 | $218.00 |
| line-3 | Hosa HMIC-010 | 2 | $32.22 |
| line-4 | RODE PSA1 | 2 | $198.00 |
| line-5 | Sony MDR-7506 | 2 | $196.00 |
| | **Total** | | **$869.21** |

Rejected on screen: **Logitech G Yeti Orb** (USB-C only; the 2i2 has XLR mic inputs). It is tried first because candidates are tried cheapest first, so the rejection is a real audit result, not a staged one.

Shipping beats for the video:
- line-1 ships as `Scarlett 2i2 4th Gen` → charged.
- line-5 ships as `MDR-7506` → charged.
- line-2 ships as `SM58S` (the switch variant) → not charged.
- Finish order → the rest is released.

Timing of one live `/api/bundle` call: not measured yet (B fills this in).
