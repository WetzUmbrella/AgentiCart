# Demo bundle

Goal text: **Podcast setup for 2 people under $900**

With the current catalogue the builder produces (confirmed live on 2 Nov with `gemini-3.1-pro-preview`; mock mode matches):

| Line | Part | Qty | Amount |
|---|---|---|---|
| line-1 | Focusrite Scarlett 2i2 4th Gen | 1 | $224.99 |
| line-2 | Shure SM58-LC | 2 | $218.00 |
| line-3 | Hosa HMIC-010 | 2 | $32.22 |
| line-4 | Logitech G Compass Broadcast Boom Arm | 2 | $199.98 |
| line-5 | Sony MDR-7506 | 2 | $196.00 |
| | **Total** | | **$871.19** |

Rejected on screen, both real audit results (candidates are tried cheapest first, so neither is staged):
- **Logitech G Yeti Orb**: USB-C only; the 2i2 has XLR mic inputs.
- **RODE PSA1**: 3/8 inch thread only, and the SM58-LC is 5/8 inch with no adapter in its box. In the live run the AI also noted the SM58 is below the PSA1's 700 g minimum load, so the arm would spring up.

Shipping beats for the video:
- line-1 ships as `Scarlett 2i2 4th Gen` → charged.
- line-5 ships as `MDR-7506` → charged.
- line-2 ships as `SM58S` (the switch variant) → not charged, with one recheck offered; repack as `SM58-LC` → charged. Both label photos stay on the console as evidence.
- line-4 (Compass arm) can ship on the "Compass arm" sample label (read correctly by live Gemini on 6 Nov), or show "Can't fulfil this part" (out of stock).
- Finish order → the rest is released.

Timing of one live `/api/bundle` call: **64 s** (2 Nov) and **85 s** (6 Nov), production build on a laptop, `gemini-3.1-pro-preview`. Too long to show uncut on video: cut or speed up the wait. The shop page now streams progress (`/api/bundle?stream=1`) and shows each part being checked against the parts already picked, with a seconds counter.
