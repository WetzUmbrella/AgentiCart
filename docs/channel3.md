# Channel3 live prices: team brief

Status: **agreed by the team on 4 Nov.** Still to decide in chat: who writes `lib/channel3.ts` (see "Decisions still open").

This file is the single source of truth for the Channel3 change. If you use Claude (or any AI) for your part, give it this file first so everyone builds to the same rules.

## What we're adding, in one paragraph

We keep the curated catalogue, the spec-sheet audit and the PayPal flow **exactly as they are**. The only change: for each catalogue product, the app looks up its live price and stock on Channel3 (a hackathon sponsor) and shows that instead of the fixed price we checked by hand. If Channel3 doesn't answer, the app uses the fixed price as now. The AI never sees Channel3 data and never picks products from it.

## What we are NOT doing, and why

Full live sourcing (letting Channel3 search for products and the app pick from the results) was tested on 4 Nov and **failed**:
- Searching for our 23 products by name put the exact variant first for only 13 to 15 (pass mark was 18).
- In search, the SM58-LC and SM58S came back as the same listing, and the SM58S label refusal is our demo's key moment.
- About a quarter of category results had no model name ("Microphone Boom Arm", "Studio Headphones"), or were off-target ($10 karaoke mics, snare mics, adapter cables).
- Only 3 of 5 category searches returned the same products twice.

So nobody should build search-based sourcing. It goes on the next-steps slide.

## Evidence that the small version works

- Lookup by product ID (`GET /v1/products/{id}`): **115 of 115** worked, the same answer on a repeat lookup **23 of 23**, about **0.44 s** each. These lookups are **free** (searches cost 1 credit).
- Product details include variants with their own IDs, so the SM58 splits into "Standard" (`a8ibawf`) and "with On/Off Switch" (`997Bp2Z`). Both were checked by hand.
- **22 of 23** products mapped to an exact listing by hand. Only `stand-psa1` has none (Channel3 only lists 2-packs and kits), so it keeps its fixed price. It's the stand we reject in the demo anyway.
- Scripts on the `des` branch: `scripts/channel3-probe.mjs` (the failed search test) and `scripts/channel3-lookup.mjs` (the lookup test).

## Data contract (Des)

`data/catalogue.json` gets one new field per product, placed after `price_source_url`:

```json
"channel3_id": "4fBNZlu"
```

- `lib/catalogue.ts` schema: `channel3_id: z.string().regex(/^[A-Za-z0-9]+$/).nullable().optional()`
- `null` or missing means no exact listing, so the product always uses its fixed price.
- `price_usd` and `price_date` stay as the fallback. Do not overwrite them with live prices.
- Checked on a copy of main: `npm run check-catalogue` OK, `npm test` 130/130, `tsc` clean.

| Product | channel3_id | Notes |
|---|---|---|
| if-2i2-4 | 4fBNZlu | |
| if-solo-4 | rDhaAkm | |
| if-umc22 | Fl2cJHW | |
| if-uca202 | T5gOhYZ | |
| if-mtrack-solo | lARsxr6 | |
| mic-yeti-orb | RpcnwIw | |
| mic-sm58lc | a8ibawf | Variant "Standard" |
| mic-sm58s | 997Bp2Z | Variant "with On/Off Switch". The title alone just says "Shure SM58 Dynamic Microphone" |
| mic-at2020 | N151roI | |
| mic-podmic-usb | khLtSoJ | |
| mic-sm7b | TqELZzB | |
| mic-at2035 | IQsHLHh | The mic alone, not the bundle |
| cable-hosa-hmic010 | dBE0Bou | 10 ft |
| cable-mogami-trs10 | reu9FTR | "10 foot" variant |
| cable-rode-sc18 | MJpZVXy | Description confirms "5-foot Rode SC18" |
| stand-psa1 | null | No exact listing |
| stand-elgato-lp | YBhy9Qk | |
| stand-compass | cQAmHdK | |
| hp-mdr7506 | gCZVZGC | |
| hp-m50x | BcmGQxK | |
| hp-dt770-250 | HmORKuT | 250 ohm, no bundle |
| hp-hd600 | ggYTD8W | Includes the official Sennheiser store |
| hp-k371 | pku7vMA | |

## Channel3 API facts

- Base URL `https://api.trychannel3.com/v1`, header `x-api-key: <key>`.
- Key in `.env.local` as `CHANNEL3_API_KEY`. Add the name (no value) to `.env.example`. **Never commit the key, and never send it to the browser.** Server code only.
- `GET /products/{id}` returns `{ id, title, brands, offers[], variants, ... }`.
- Each offer: `domain`, `price`, `availability` (`InStock` / `OutOfStock`), `condition` (`new` / `used` / sometimes `null`), `url` (a Channel3 buy link).
- **The price shape varies:** we saw `offer.price.price` in responses, and the docs show `offer.price.amount`. Read both: `p.amount ?? p.price`. The currency is `offer.price.currency`.

## Price rules (everyone must use these)

1. **Valid offer:** `condition === "new"` **and** `availability === "InStock"` **and** currency `USD`. Ignore used, out-of-stock and `null`-condition offers (some are refurbished).
2. **Live price:** the cheapest valid offer.
3. **Outlier guard:** ignore any offer below **60%** of the product's `price_usd`. (We saw one SM7B listing at $199 on kohls.com, when every other retailer was $439.)
4. **Fallback:** no `channel3_id`, no valid offer, an error, or a timeout (**3 s**) means use `price_usd`, labelled "price checked {price_date}".
5. **Cache** each lookup on the server for **10 minutes**, so a bundle build and a swap don't repeat calls.
6. **The price shown is the price charged.** The server stores the live price with the bundle when it's built, and `lib/orders.ts` uses that stored price for the PayPal order. Never take a price from the browser. Never re-fetch at checkout, or the total could change between screen and popup.
7. **Switch:** `LIVE_PRICES=1` turns it on and `0` (the default) keeps today's behaviour exactly. With `0`, nothing calls Channel3 and the demo bundle total stays $871.19.

## Who does what

| Person | Task |
|---|---|
| **Des** | `channel3_id` field and schema line (done, on `des`, waiting to be merged). This brief. Go/no-go note. Tests the finished feature: lookups, fallback with a bad key, `LIVE_PRICES=0` gives $871.19 three times in a row. README "What's real" table, video script, Devpost (add Channel3 to "Built with" and enter Best Use of Channel3) |
| **Ahsanul or Yi Heng** (decide in chat) | `lib/channel3.ts`: `livePrice(product)` returning `{ price_usd, source: "live" or "fixed", retailer?, checked_at }`, applying the price rules above, with a cache and a 3 s timeout. Unit tests for each rule, with Channel3 mocked |
| **Yi Heng** | Use the price stored with the bundle in `lib/orders.ts` (rule 6), keeping the "never from the browser" check. Test that `LIVE_PRICES=0` is unchanged |
| **Cheston** | Price cell: "$X live, {retailer}, {time}" or "$X, price checked {date}". Show the variant label for the SM58s. No layout change otherwise |
| **Ahsanul** | Merge by **Fri 6 Nov**. Keep `LIVE_PRICES=0` on main until Des's Friday test passes |

## Decisions still open

- Who writes `lib/channel3.ts`: Ahsanul or Yi Heng?
- Hosted demo for judges: `LIVE_PRICES=1` (live, total changes) or `0` (fixed $871.19)? Suggestion: `1` on the hosted app, with the video recorded on `0` and a short segment showing a live price.
- Is "Channel3" OK to show on screen? (Check the brand-name reply from the organisers, D-11.)

## Timeline

- **Wed 4 Nov:** team agreed. Des pushed the data change and this brief.
- **Thu 5 Nov:** `lib/channel3.ts`, the orders change and the UI cell built on branches.
- **Fri 6 Nov:** merged into main. Des runs the tests above.
- **Sat 7 Nov:** freeze. If it isn't passing by then, `LIVE_PRICES=0` ships and Channel3 goes on the next-steps slide.
