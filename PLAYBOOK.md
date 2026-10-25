> Copied from the planning folder on 18 Oct 2026. From now on this repo copy is the source of truth. Note: the code already implements the review fixes (see README), so some steps here describe work that is done.

# AgentCart: Team Playbook

**One file with everything the team needs: what we're building, who does what, and exactly how, step by step.**

PayPal AI Hackathon · Written 18 Oct 2026 · Feature freeze **Fri 7 Nov** · Submit by **Tue 11 Nov** (hard deadline 12 Nov, 12:00pm PT = **13 Nov, 04:00 SGT**)

---

## 0. How to use this file

1. Read sections 1 to 4 once (15 minutes). Everyone, no exceptions.
2. Find your letter in section 3. Your tasks are in **section 6 (A, B, C or D)**. Do them in order.
3. Each task has a **Done when** line. A task isn't done until that line is true and someone else has checked it.
4. If something breaks, check **section 12 (Troubleshooting)** before asking.
5. If a step here is wrong, fix this file in the repo and tell the group chat. This file is the single source of truth.

**Golden rules:**
- If a feature isn't in the demo script (section 9), don't build it.
- If a feature isn't working by **Sat 1 Nov**, cut it.
- Never commit secrets. `.env.local` stays on your machine.
- `main` always works. Work on a branch; merge only after one teammate reviews.

---

## 1. What we're building (read this twice)

**AgentCart** builds a compatible gear bundle (for example, a podcast setup) by reading manufacturers' spec sheets. The shopper approves the whole bundle **once** with PayPal. PayPal **holds** the money (authorisation) but **doesn't charge** it. Each part is **charged only when our AI confirms the part the merchant is shipping is the exact part it verified**. Parts that don't match are **never charged**. When everything is resolved, the leftover hold is **released** (void).

**Pitch line:** *"Approve once. Pay only for parts confirmed to fit."*

### The flow in 8 steps

```
1. Shopper types a goal      "Podcast setup for 2 people under $800"
2. AI picks parts            from our catalogue, reads each spec sheet
3. AI audits compatibility   rejects bad pairings, cites the spec line
4. Shopper edits bundle      in an AG Grid table; swapped rows re-audit
5. Shopper approves once     PayPal popup → AUTHORISED (nothing charged)
6. Merchant ships a part     enters exact model + tracking number
7. AI checks shipped model   MATCH → capture that line + attach tracking
                             MISMATCH → never charged, shopper told why
8. All lines resolved        remaining authorisation VOIDED
```

### What the AI decides (this is why we can win)

| Decision | Effect on money |
|---|---|
| Is this part compatible with the rest of the bundle? | Decides what goes into the authorised order |
| Is the shipped model the one we verified? | **Capture or don't capture that line** |

**Safety rule:** the AI never calls PayPal to move money. It only returns a JSON verdict. Our server code does the capturing and voiding.

---

## 2. Glossary (no shame in reading this)

| Word | Meaning |
|---|---|
| **Sandbox** | PayPal's fake-money test environment. Everything we do uses it |
| **Order** | A PayPal object describing what's being bought (`/v2/checkout/orders`) |
| **Purchase unit** | One part of an order paid to one merchant (payee). An order can have several |
| **Authorise / authorisation** | The shopper approves; PayPal reserves the money. **Nothing is charged** |
| **Capture** | Actually charging some or all of an authorisation |
| **Partial capture** | Charging only part of the authorised amount (e.g. one line item) |
| **Void** | Cancelling the rest of an authorisation, so it's never charged |
| **Honour period** | Captures are only guaranteed within roughly 3 days of authorising. For the demo, capture within it |
| **Webhook** | PayPal calling **our** server to say something happened (e.g. "capture completed") |
| **PayPal-Request-Id** | A unique header we send so a retried request can't charge twice |
| **Spec sheet** | The manufacturer's PDF or page listing connectors, power and so on |
| **Verdict** | The AI's JSON answer: compatible or not, match or not, and why |
| **Agent Toolkit** | PayPal's official library that gives an AI agent PayPal tools (`@paypal/agent-toolkit`) |

---

## 3. Team and roles (4 people)

| Letter | Role | Owns | Name |
|---|---|---|---|
| **A** | **Payments lead** | Everything PayPal: orders, authorise, capture, void, tracking, webhooks, deploy on Render | ______ |
| **B** | **AI lead** | Gemini prompts, JSON schemas, compatibility audit, shipped-model check, 20-case test script | ______ |
| **C** | **Front-end lead** | Next.js pages, AG Grid bundle view, PayPal button, merchant console, design | ______ |
| **D** | **Data, story and QA** | Catalogue and spec sheets, cached forum threads, test-set answers, README, video, Devpost, testing every flow | Des |

**Pairs that must agree early:**

| Pair | Agree on | By |
|---|---|---|
| A + B | The verdict JSON shape (section 5.3) and when captures fire | Tue 21 Oct |
| B + D | Catalogue and test-set formats (sections 5.1, 5.4) | Mon 20 Oct |
| A + C | API routes and their request/response shapes (section 5.5) | Tue 21 Oct |
| D + everyone | Demo script (section 9), run every Sunday | Sun 26 Oct onwards |

**Meetings:**
- Two 15-minute check-ins a week (Wed and Fri evening): what I finished, what's blocking me.
- One 1-hour Sunday session: all four run the full flow together, and D records any bugs.

---

## 4. Timeline at a glance

| Week | Dates | Goal | Checkpoint |
|---|---|---|---|
| 0 | Sun 18 to Fri 24 Oct | Setup + **5 go/no-go tests** (section 7) | All 5 tests have a pass or fail recorded |
| 1 | Sat 25 to Fri 31 Oct | Ugly end-to-end loop works once | Goal → bundle → approve → ship → capture/no-capture → void, on screen |
| 2 | Sat 1 to Fri 7 Nov | UI polish, merchant console, deploy, accuracy run. **Freeze Fri 7 Nov** | A stranger can use the hosted demo unaided |
| 3 | Sat 8 to Tue 11 Nov | Video, README, Devpost. Fix only what the video exposed | **Submitted Tue 11 Nov** |

**Cut-off:** anything not working by **Sat 1 Nov** gets cut. No new features after **Fri 7 Nov**.

---

## 5. Shared contracts (agree these first; don't change them without telling everyone)

### 5.1 Catalogue file: `data/catalogue.json` (owner: D)

An array of about 25 real products.

```json
[
  {
    "id": "mic-sm58",
    "category": "microphone",
    "brand": "Shure",
    "model": "SM58",
    "variant": "SM58-LC",
    "price_usd": 99.00,
    "price_date": "2026-10-20",
    "merchant": "merchant_a",
    "spec_file": "specs/mic-sm58.pdf",
    "spec_source_url": "https://www.shure.com/...",
    "key_specs": {
      "connector": "XLR-3M",
      "needs_phantom_power": false,
      "mount_thread": "5/8-27"
    }
  }
]
```

**Rules:**
- `merchant` must be one of `merchant_a`, `merchant_b` or `merchant_c`. These map to the sandbox business accounts in section 6A.
- `spec_file` is a real PDF or PNG saved in `data/specs/`.
- `key_specs` is filled by D **by hand from the spec sheet**. It's ground truth for testing; the AI never sees it.

### 5.2 Cached forum threads: `data/threads.json` (owner: D)

```json
[
  {
    "product_id": "mic-sm58",
    "source": "reddit.com/r/podcasting",
    "url": "https://www.reddit.com/r/podcasting/comments/...",
    "retrieved": "2026-10-22",
    "text": "Copied relevant comment text here..."
  }
]
```

**Rule:** every entry has a real `url`. Copy the text by hand; **don't build a scraper**.

### 5.3 AI verdict shapes (owner: B; A and C must read this)

**Compatibility audit** (one per product checked against the bundle):

```json
{
  "product_id": "mic-nt1",
  "compatible": false,
  "confidence": "high",
  "reason": "Condenser mic needs 48V phantom power; the selected interface has no phantom power.",
  "evidence": [
    { "product_id": "mic-nt1", "quote": "Requires 48V phantom power" },
    { "product_id": "if-xyz", "quote": "Inputs: 2x line-level TRS" }
  ]
}
```

**Shipped-model check** (one per shipped line):

```json
{
  "line_id": "line-2",
  "match": false,
  "reason": "Shipped model 'SM58S' has an on/off switch variant; verified part was 'SM58-LC'. Same connector, but not the verified variant.",
  "action": "DO_NOT_CAPTURE"
}
```

`action` is always either `"CAPTURE"` or `"DO_NOT_CAPTURE"`. A's code only looks at `action`.

### 5.4 Test set: `data/testset.json` (answers by D, script by B)

```json
[
  {
    "case_id": "t01",
    "bundle": ["mic-nt1", "if-xyz"],
    "check": "mic-nt1",
    "expected_compatible": false,
    "why": "No phantom power on interface"
  }
]
```

**Mix:** 8 compatible, 8 incompatible, 4 tricky (needs an adapter, or works but under-powered). D writes the answers **before** B runs the AI, and B never edits them.

### 5.5 API routes (owner: A for payments, B for AI, C calls them)

| Method + path | Body in | Returns | Owner |
|---|---|---|---|
| `POST /api/bundle` | `{ goal: string }` | `{ lines: [{line_id, product, verdict}] }` | B |
| `POST /api/audit` | `{ bundle: [product_id] , check: product_id }` | compatibility verdict (5.3) | B |
| `POST /api/orders` | `{ lines: [{line_id, product_id, qty}] }` | `{ orderId }` | A |
| `POST /api/orders/:id/authorize` | none | `{ authorizations: [{line_id?, auth_id, amount}] , status }` | A |
| `POST /api/ship` | `{ orderId, line_id, shipped_model, tracking_number, carrier }` | `{ verdict, captured: bool, capture_id? }` | A (calls B's check) |
| `POST /api/orders/:id/close` | none | `{ voided: bool }` | A |
| `GET /api/orders/:id` | none | full order state for the UI | A |
| `POST /api/paypal/webhook` | PayPal event | `200 OK` | A |
| `POST /api/reset` | none | resets demo state | A |

### 5.6 Line states (everyone uses these exact words)

```
IN_BUNDLE → AUTHORISED → SHIPPED → CAPTURED
                                 ↘ NOT_CHARGED (mismatch)
Any line still AUTHORISED at close → VOIDED
```

---

## 6. Step-by-step tasks per person

> Everyone first does **6.0** (about 1 hour), then their own section.

### 6.0 Everyone: setup (do this Sun 18 or Mon 19 Oct)

1. Install **Node.js 20 LTS** or newer: https://nodejs.org. Check with `node -v`.
2. Install **Git** and log into GitHub.
3. A creates the repo (6A step 1). Everyone else waits for the invite, then runs:
   ```bash
   git clone https://github.com/<team>/agentcart.git
   cd agentcart
   npm install
   ```
4. A shares the sandbox **Client ID** and **Secret** in a private message (never in the repo). Create `.env.local` in the project root:
   ```env
   PAYPAL_CLIENT_ID=xxx
   PAYPAL_CLIENT_SECRET=xxx
   PAYPAL_API_BASE=https://api-m.sandbox.paypal.com
   NEXT_PUBLIC_PAYPAL_CLIENT_ID=xxx
   PAYPAL_WEBHOOK_ID=xxx
   GEMINI_API_KEY=xxx
   GEMINI_MODEL_PRO=<exact model name from AI Studio>
   GEMINI_MODEL_FLASH=<exact model name from AI Studio>
   MERCHANT_A_EMAIL=xxx@business.example.com
   MERCHANT_B_EMAIL=xxx@business.example.com
   MERCHANT_C_EMAIL=xxx@business.example.com
   ```
5. Run `npm run dev` and open http://localhost:3000. You should see the starter page.
6. **Git workflow:**
   ```bash
   git checkout main && git pull
   git checkout -b feat/<your-thing>
   # ...work...
   git add . && git commit -m "Short clear message"
   git push -u origin feat/<your-thing>
   ```
   Then open a pull request on GitHub and ask one teammate to review. **Never push straight to `main`.**

**Done when:** you can run the app locally and you've opened (and had merged) one tiny pull request, for example adding your name to section 3 of this file.

---

### 6A. Person A: payments lead

#### A1. Create the repo (Sun 18 Oct)

```bash
npx create-next-app@latest agentcart --ts --app --eslint --src-dir=false --import-alias "@/*"
cd agentcart
npm install @google/genai @paypal/react-paypal-js ag-grid-react ag-grid-community zod
git init && git add . && git commit -m "Initial Next.js app"
```

1. Create the GitHub repo **agentcart** (public) and push.
2. Add a `LICENSE` file: on GitHub, Add file → Create new file → name it `LICENSE` → choose **MIT** → commit.
3. Check `.gitignore` contains `.env*.local`.
4. Copy this playbook into the repo as `PLAYBOOK.md`.
5. Invite B, C and D as collaborators.
6. Protect `main`: Settings → Branches → require one pull-request review.

**Done when:** all three teammates have cloned the repo and run it.

#### A2. Set up the PayPal sandbox (Sun 18 Oct)

1. Go to https://developer.paypal.com and log in. Use a personal PayPal account, or create one.
2. **Apps & Credentials** → make sure the toggle says **Sandbox** → **Create App** → name it `agentcart` → type **Merchant**. Copy the **Client ID** and **Secret**.
3. **Testing Tools → Sandbox Accounts** → **Create account**. Create:
   - 1 × **Personal** account, country **United States**. This is the **shopper**; note its email and password.
   - 3 × **Business** accounts, country **United States**: `merchant_a`, `merchant_b`, `merchant_c`. Note their emails.
   - Use the **United States for every account**. PayPal recommends buyer and merchant in the same country, and mixing countries causes errors we don't need.
4. Your app's own sandbox business account (shown under the app) is the **platform** account.
5. Share the Client ID, Secret and the four emails privately with the team.

**Done when:** you can log into https://www.sandbox.paypal.com as the shopper and as `merchant_a`.

#### A3. Build the PayPal helper `lib/paypal.ts` (Mon 19 to Tue 21 Oct)

Copy this skeleton, then make it work. Every money-moving call sends a unique `PayPal-Request-Id`.

```ts
// lib/paypal.ts
import crypto from "crypto";

const BASE = process.env.PAYPAL_API_BASE!;

let cachedToken: { value: string; expires: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires - 60_000) return cachedToken.value;
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Token failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  cachedToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

async function pp(path: string, method: string, body?: unknown, idempotent = false) {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (idempotent) headers["PayPal-Request-Id"] = crypto.randomUUID();
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return json;
}

// 1) Create an order with intent AUTHORIZE
//    unitsByMerchant: one purchase unit per merchant (multi-merchant version)
export function createOrder(units: Array<{
  reference_id: string;          // e.g. "merchant_a"
  payee_email?: string;          // leave undefined for single-merchant version
  items: Array<{ name: string; sku: string; quantity: string; unit_amount: string }>;
}>) {
  return pp("/v2/checkout/orders", "POST", {
    intent: "AUTHORIZE",
    purchase_units: units.map((u) => {
      const total = u.items
        .reduce((s, i) => s + Number(i.unit_amount) * Number(i.quantity), 0)
        .toFixed(2);
      return {
        reference_id: u.reference_id,
        ...(u.payee_email ? { payee: { email_address: u.payee_email } } : {}),
        amount: {
          currency_code: "USD",
          value: total,
          breakdown: { item_total: { currency_code: "USD", value: total } },
        },
        items: u.items.map((i) => ({
          name: i.name,
          sku: i.sku,
          quantity: i.quantity,
          unit_amount: { currency_code: "USD", value: i.unit_amount },
        })),
      };
    }),
  }, true);
}

// 2) After the shopper approves in the popup: authorise the order
export function authorizeOrder(orderId: string) {
  return pp(`/v2/checkout/orders/${orderId}/authorize`, "POST", {}, true);
}

// 3) Capture ONE line's amount from an authorisation (partial capture)
export function captureLine(authId: string, value: string, finalCapture = false) {
  return pp(`/v2/payments/authorizations/${authId}/capture`, "POST", {
    amount: { currency_code: "USD", value },
    final_capture: finalCapture,
  }, true);
}

// 4) Void whatever is left on an authorisation
export function voidAuthorization(authId: string) {
  return pp(`/v2/payments/authorizations/${authId}/void`, "POST", undefined, true);
}

// 5) Attach tracking to a capture
export function addTracking(orderId: string, captureId: string, trackingNumber: string, carrier = "OTHER", carrierNameOther = "Demo Courier") {
  return pp(`/v2/checkout/orders/${orderId}/track`, "POST", {
    capture_id: captureId,
    tracking_number: trackingNumber,
    carrier,
    ...(carrier === "OTHER" ? { carrier_name_other: carrierNameOther } : {}),
    notify_payer: false,
  }, true);
}

// 6) Verify a webhook really came from PayPal
export async function verifyWebhook(headers: Headers, rawBody: string) {
  const result = await pp("/v1/notifications/verify-webhook-signature", "POST", {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: process.env.PAYPAL_WEBHOOK_ID,
    webhook_event: JSON.parse(rawBody),
  });
  return result.verification_status === "SUCCESS";
}
```

**Notes:**
- If any request body here is rejected, read the error text. It names the bad field. Fix it against the official docs: https://developer.paypal.com/docs/api/orders/v2/ and https://developer.paypal.com/docs/api/payments/v2/
- After `authorizeOrder`, the authorisation IDs are at `purchase_units[i].payments.authorizations[0].id`. Store them per merchant.

**Done when:** go/no-go tests 1, 2 and 3 (section 7) have been run and the results recorded.

#### A4. Demo state store (Tue 21 Oct)

We don't need a database. Use an **in-memory store**, seeded at startup, with a **Reset** button. Judges trying the hosted demo get a clean scenario every time.

```ts
// lib/store.ts
type LineState = "IN_BUNDLE" | "AUTHORISED" | "SHIPPED" | "CAPTURED" | "NOT_CHARGED" | "VOIDED";
export type Line = {
  line_id: string; product_id: string; merchant: string;
  qty: number; amount: string; state: LineState;
  auth_id?: string; capture_id?: string; verdict?: unknown;
};
export type Order = { orderId: string; lines: Line[]; status: string; events: string[] };

const g = globalThis as unknown as { __orders?: Map<string, Order> };
export const orders = (g.__orders ??= new Map<string, Order>());
export function resetAll() { orders.clear(); }
```

**Done when:** `POST /api/reset` empties the store and the UI shows a fresh state.

#### A5. API routes (Wed 22 Oct to Fri 31 Oct)

Build them in this order. Test each one with `curl` before moving on.

1. `POST /api/orders`: groups lines by merchant, calls `createOrder`, saves the order with lines in `IN_BUNDLE`, and returns `{ orderId }`.
2. `POST /api/orders/:id/authorize`: calls `authorizeOrder`, stores each merchant's `auth_id` on its lines, and sets them to `AUTHORISED`.
3. `POST /api/ship` (the heart of the product):
   1. Load the line, set it to `SHIPPED`, and log the event.
   2. Call B's `checkShippedModel(line, shipped_model)` from `lib/ai.ts`.
   3. If `verdict.action === "CAPTURE"`: call `captureLine(line.auth_id, line.amount)`, save the `capture_id`, call `addTracking(...)`, and set the line to `CAPTURED`.
   4. If `"DO_NOT_CAPTURE"`: set the line to `NOT_CHARGED`. **Make no PayPal call.**
   5. Return `{ verdict, captured, capture_id }`.
4. `POST /api/orders/:id/close`: for every authorisation still open, call `voidAuthorization`, and set any lines still `AUTHORISED` to `VOIDED`.
5. `GET /api/orders/:id`: returns the whole order for the UI to poll every 2 seconds.
6. `POST /api/paypal/webhook`:
   1. Read the raw body (`await req.text()`) and call `verifyWebhook`.
   2. If verified, append the event type to `order.events`.
   3. Always return `200`, even for events you ignore.

**Testing a route with curl:**

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"lines":[{"line_id":"line-1","product_id":"mic-sm58","qty":1}]}'
```

**Done when:** the full flow works from curl alone. Create, approve in the browser, authorise, ship a matching line, ship a mismatching line, close. Then check in the sandbox merchant accounts that only the matching line was charged.

#### A6. Deploy on Render and register webhooks (Sat 25 Oct, early on purpose)

1. https://render.com → sign up with GitHub → **New → Web Service** → pick the `agentcart` repo.
2. **Build command:** `npm install && npm run build`. **Start command:** `npm start`.
3. **Environment:** add every variable from `.env.local`.
4. Deploy. Copy the URL, for example `https://agentcart.onrender.com`.
5. PayPal developer dashboard → your app → **Webhooks → Add Webhook**:
   - URL: `https://agentcart.onrender.com/api/paypal/webhook`
   - Events: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.AUTHORIZATION.CREATED`, `PAYMENT.AUTHORIZATION.VOIDED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`
   - Save, copy the **Webhook ID** into Render's `PAYPAL_WEBHOOK_ID`, and redeploy.
6. The free Render tier **sleeps after inactivity**, and the first request takes about 50 seconds. Before recording the video, open the site and wait until it loads.

**Done when:** a capture on the hosted site shows `PAYMENT.CAPTURE.COMPLETED` in the order's event list.

#### A7. Agent Toolkit integration (Mon 27 to Wed 29 Oct)

1. `npm install @paypal/agent-toolkit`
2. Read its README (https://github.com/paypal/agent-toolkit). Find out:
   - how to enable **only** `create_order` and `get_order`;
   - whether `create_order` lets us set `intent: AUTHORIZE` (go/no-go test 5).
3. **If it supports AUTHORIZE:** the bundle agent (B's `/api/bundle`) may call the toolkit's `create_order` as a tool, and A's `/api/orders` uses that.
4. **If it doesn't:** keep creating orders with our REST helper, and use the toolkit's `get_order` so the agent can read and explain the order to the shopper.
5. Either way, **never** expose capture, refund, `pay_order` or invoice tools to the model.

**Done when:** the toolkit is in the code, only the allowed tools are enabled, and the README says which tools we use and why.

---

### 6B. Person B: AI lead

#### B1. Gemini access (Sun 18 Oct)

1. https://aistudio.google.com → **Get API key** → create a key and put it in `.env.local` as `GEMINI_API_KEY`.
2. In AI Studio, note the **exact model names** of the current Pro and Flash models. Put them in `GEMINI_MODEL_PRO` and `GEMINI_MODEL_FLASH`, and tell D (they go in the Devpost tools list).
3. Check the free-tier rate limits on the same page. If they're tight, the 20-case test run needs pauses between calls.

**Done when:** a 5-line script returns "hello" from Gemini.

#### B2. Compatibility audit `lib/ai.ts` (Mon 20 to Fri 24 Oct)

```ts
// lib/ai.ts
import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";
import path from "path";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

function specPart(specFile: string) {
  const abs = path.join(process.cwd(), "data", specFile);
  const mimeType = specFile.endsWith(".pdf") ? "application/pdf" : "image/png";
  return { inlineData: { mimeType, data: fs.readFileSync(abs).toString("base64") } };
}

const auditSchema = {
  type: Type.OBJECT,
  properties: {
    product_id: { type: Type.STRING },
    compatible: { type: Type.BOOLEAN },
    confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
    reason: { type: Type.STRING },
    evidence: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { product_id: { type: Type.STRING }, quote: { type: Type.STRING } },
        required: ["product_id", "quote"],
      },
    },
  },
  required: ["product_id", "compatible", "confidence", "reason", "evidence"],
};

export async function auditCompatibility(
  check: { id: string; spec_file: string; brand: string; model: string },
  others: Array<{ id: string; spec_file: string; brand: string; model: string }>
) {
  const prompt = `You are checking whether one audio product works with the rest of a bundle.
Use ONLY the attached spec sheets. Do not use outside knowledge about these products.
Check: connector types, phantom power need vs supply, USB vs XLR, mount threads, power.
If a spec sheet does not state something, say so and lower confidence. Never guess.
Quote the exact spec-sheet text you relied on in "evidence".
Product to check: ${check.brand} ${check.model} (id ${check.id}).
Other products: ${others.map(o => `${o.brand} ${o.model} (id ${o.id})`).join("; ")}.
The spec sheets are attached in the same order: first the product to check, then the others.`;

  const res = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL_PRO!,
    contents: [{ role: "user", parts: [{ text: prompt }, specPart(check.spec_file), ...others.map(o => specPart(o.spec_file))] }],
    config: { responseMimeType: "application/json", responseSchema: auditSchema, temperature: 0 },
  });
  return JSON.parse(res.text!);
}
```

**Rules:**
- `temperature: 0`, so the same input gives the same answer.
- The prompt forbids outside knowledge. Every verdict must quote the spec sheet.
- **If the SDK call shape differs** from the above in the version you install, follow the `@google/genai` README. The idea stays the same: text plus attached files in, JSON with a schema out.

**Done when:** `auditCompatibility` correctly rejects the phantom-power case from D's test set, with a real quote.

#### B3. Shipped-model check (Sat 25 to Tue 28 Oct)

Add `checkShippedModel(line, shipped_model)` to `lib/ai.ts`. Use the Flash model.
- **Inputs:** the verified product (brand, model, variant and spec sheet) and the text the merchant typed.
- **Output:** the shipped-model JSON from section 5.3. `action` must be `CAPTURE` only when brand, model **and** variant all match; otherwise `DO_NOT_CAPTURE`.
- Add a **plain code check first**: if the shipped text exactly equals the verified `variant`, return `CAPTURE` without calling the AI. The AI handles the messy cases ("Shure SM58 LC", "SM-58", "SM58S").

**Done when:** "SM58-LC" gives CAPTURE, "Shure SM58 LC" gives CAPTURE, and "SM58S" gives DO_NOT_CAPTURE with a sensible reason.

#### B4. Bundle builder `/api/bundle` (Wed 29 Oct to Sat 1 Nov)

1. Use the Flash model to turn the goal into constraints JSON: `{ budget_usd, hosts, categories_needed: [...] }`.
2. Pick candidate products from `catalogue.json` with plain code (filter by category and budget). **Don't let the AI invent products.**
3. Run `auditCompatibility` on each pick against the others. If one fails, try the next candidate in that category.
4. Make sure the default demo goal **includes one rejected condenser mic** (the "money didn't need to move" moment before checkout). Work with D to choose it.

**Done when:** the demo goal returns a full, compatible bundle within budget, with one visible rejection.

#### B5. Accuracy test script (Sun 2 to Wed 5 Nov)

1. Create `scripts/run-testset.ts`. For each case in `testset.json`, call `auditCompatibility`, compare with `expected_compatible`, and print a table and a final score.
2. Run it with `npx tsx scripts/run-testset.ts > results/testset-YYYY-MM-DD.txt`.
3. Commit the results file. Give D the score for the README, video and Devpost.
4. **If the score is below 17/20:** list which pairings fail, then improve the prompt or limit the demo to pairings it handles. **Never edit D's answers to raise the score.**

**Done when:** the results file is committed and D has the real score.

---

### 6C. Person C: front-end lead

#### C1. Layout and pages (Mon 20 to Fri 24 Oct)

Create three pages:

| Page | Path | Purpose |
|---|---|---|
| Shopper | `/` | Goal box → bundle grid → PayPal button → live line states |
| Merchant console | `/merchant` | Pick an order, pick a line, enter shipped model + tracking, click **Mark shipped** |
| About | `/about` | What's real vs cached (copy from section 10), links, accuracy score |

Put a **Reset demo** button in the header that calls `POST /api/reset`.

**Done when:** all three pages load with placeholder content and you can navigate between them.

#### C2. AG Grid bundle table (Sat 25 to Wed 29 Oct)

```tsx
// components/BundleGrid.tsx
"use client";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
ModuleRegistry.registerModules([AllCommunityModule]);

export default function BundleGrid({ rows, onSwap }: { rows: any[]; onSwap: (lineId: string) => void }) {
  const cols = [
    { field: "product", headerName: "Part" },
    { field: "merchant" },
    { field: "price", headerName: "Price (USD)" },
    { field: "verdict", headerName: "Compatible?" },
    { field: "reason", headerName: "Why", flex: 2, wrapText: true, autoHeight: true },
    { field: "state", headerName: "Payment" },
  ];
  return (
    <div style={{ height: 420 }}>
      <AgGridReact rowData={rows} columnDefs={cols} />
    </div>
  );
}
```

**Requirements:**
- Rows that are **rejected** show red with the reason. **Captured** rows are green; **NOT_CHARGED** rows are grey with a reason; **VOIDED** rows are grey.
- A **Swap** button per row: show alternatives from the same category, and on pick, call `/api/audit` for that row only.
- A **total** that shows authorised, captured and released (voided) amounts separately. This total is the money story, so make it big.
- If your AG Grid version complains about modules, follow its install guide for that version. The module-registration line is the usual fix.

**Done when:** the demo bundle shows in the grid with verdicts, and swapping one row re-audits only that row.

#### C3. PayPal button (Thu 30 Oct to Sat 1 Nov)

```tsx
// components/PayButton.tsx
"use client";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

export default function PayButton({ lines, onAuthorised }: { lines: any[]; onAuthorised: (orderId: string) => void }) {
  return (
    <PayPalScriptProvider options={{ clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID!, intent: "authorize", currency: "USD" }}>
      <PayPalButtons
        createOrder={async () => {
          const r = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines }) });
          const { orderId } = await r.json();
          return orderId;
        }}
        onApprove={async (data) => {
          await fetch(`/api/orders/${data.orderID}/authorize`, { method: "POST" });
          onAuthorised(data.orderID);
        }}
      />
    </PayPalScriptProvider>
  );
}
```

**Notes:**
- `intent: "authorize"` **must** match the order's intent, or the popup errors.
- If your version of `@paypal/react-paypal-js` uses `"client-id"` instead of `clientId`, use what its README says.
- In the popup, log in with the **sandbox shopper** account from A2.

**Done when:** clicking the button, logging in as the shopper and approving leaves every line `AUTHORISED` in the grid, with nothing charged in the shopper's sandbox account.

#### C4. Live updates and merchant console (Sun 2 to Wed 5 Nov)

1. On the shopper page, poll `GET /api/orders/:id` every 2 seconds and update the grid states.
2. Merchant console form: order ID (dropdown of current orders), line (dropdown), shipped model (text), tracking number (text), carrier (dropdown: Demo Courier).
3. On submit, call `POST /api/ship`, then show the verdict and reason in a big panel: **"Charged $99.00"** or **"Not charged: reason"**.
4. Add a **Finish order** button that calls `/close` and shows the released amount.

**Done when:** D can run the whole demo script (section 9) using only the UI.

#### C5. Design polish (Thu 6 to Fri 7 Nov)

- One font, one accent colour, consistent spacing.
- Make the authorised, charged and released amounts readable from 2 metres away; they'll be on video.
- Test it at 1280×720, the recording size.

---

### 6D. Person D: data, story and QA

#### D1. The real story (Sun 18 to Tue 21 Oct)

1. Ask friends, family and clubs (CCAs, a podcast or streaming society): **"Have you ever bought gear that didn't work with the rest of your setup?"**
2. Get **one** real story with details: what they bought, what went wrong, what it cost, how long the return took.
3. Ask their permission to use it (first name only) in the video.
4. Write it in 3 sentences in `docs/story.md`.

**Done when:** one real, permission-given story is in the repo.

#### D2. Catalogue and spec sheets (Mon 20 to Sat 25 Oct)

1. Choose about 25 real products: 6 mics (dynamic, condenser, USB), 6 interfaces (some **with** and some **without** phantom power), 5 cables (XLR, TRS, USB), 4 stands, 4 headphones.
2. For each, download the **official** spec sheet (PDF) or take a clean screenshot of the official spec page (PNG). Save it in `data/specs/<id>.pdf` or `.png`.
3. Fill in `catalogue.json` (section 5.1): use the real price on a named date, and spread products across `merchant_a`, `merchant_b` and `merchant_c`.
4. Fill in `key_specs` **by hand** from each sheet.
5. Make sure the demo needs **at least one phantom-power mismatch** and **one variant that can be substituted** (e.g. a model with and without an on/off switch).

**Done when:** the catalogue has around 25 items, every `spec_file` opens, and B has the file.

#### D3. Test-set answers (Sat 25 to Tue 28 Oct)

1. Write the 20 cases in `testset.json` (section 5.4): 8 compatible, 8 incompatible, 4 tricky.
2. For each, write `why` in plain words, citing the spec-sheet line.
3. Commit them **before** B runs the script. Never change an answer afterwards unless you made a factual mistake; if you do, log why in the commit message.

**Done when:** 20 cases are committed and a second teammate has spot-checked 5 of them.

#### D4. Cached forum threads (Wed 29 Oct to Sat 1 Nov)

For the demo bundle's products only, copy 1 to 3 relevant comments each from real threads into `threads.json`, with the URL and date. These show as "Reported issues" in the UI. They're information only and never move money.

#### D5. QA every Sunday (26 Oct, 2 Nov, 9 Nov)

Run the demo script (section 9) from start to finish on the **hosted** site. For every problem, open a GitHub issue with:
- what you did,
- what you expected,
- what happened,
- a screenshot.

Assign it to the owner.

#### D6. README (Mon 3 to Thu 6 Nov)

Create `README.md` with these sections, in this order:
1. One-line pitch plus a screenshot.
2. **Try it:** the hosted URL, sandbox shopper login steps ("use any PayPal sandbox personal account, or the one in this README"), and the Reset button.
3. **How it works:** the 8-step flow (section 1) and the architecture diagram (section 8).
4. **PayPal APIs used:** the table in section 8.
5. **What's real vs cached:** the table in section 10.
6. **Accuracy:** "[X]/20 on real spec-sheet pairings", with a link to the results file.
7. **Run it locally:** clone, `npm install`, `.env.local` variables (names only, never values), `npm run dev`.
8. **Production notes:** the honour period and reauthorisation, and that merchants could lie about the shipped model (PayPal buyer protection still applies).
9. **Licence:** MIT.

**Done when:** a teammate who didn't write it can follow "Run it locally" from scratch on a clean machine.

#### D7. Video (Sat 8 to Mon 10 Nov)

1. Install **OBS Studio** (free). Set the canvas to 1280×720, 30 fps.
2. Wake the Render site first (open it and wait).
3. Press **Reset demo**.
4. Record the screen following section 9 **exactly**. Record the voice-over separately if that's easier.
5. Edit in any free editor (CapCut, DaVinci Resolve, Clipchamp). Target **2:45**; the hard limit is under **3:00**.
6. **No copyrighted music.** Use silence or the YouTube Audio Library.
7. Upload to YouTube as **Public**. Title: "AgentCart: approve once, pay only for parts confirmed to fit (PayPal AI Hackathon)".
8. Watch it once on a phone with the sound off. Can you still follow the story? If not, add captions.

#### D8. Devpost submission (Tue 11 Nov)

1. Copy the text from `AgentCart_Project_Description.md` and fill **every** `[bracket]`.
2. Paste in: elevator pitch, description sections, "Built with" tags.
3. Add: GitHub URL, hosted URL, YouTube URL, 3 screenshots (bundle grid, captured vs not charged, finished order).
4. Tools list: exact Gemini model names from B.
5. Choose the categories: Best Use of PayPal + AI, Best Use of Agentic Commerce, Best Demo Delivery, and the AG Grid sponsor prize.
6. Add all teammates on Devpost.
7. **Submit on Tue 11 Nov.** Then take a screenshot of the confirmation page and post it in the group chat.

---

## 7. Go/no-go tests (all by Fri 24 Oct)

Record each result in `docs/go-no-go.md` as `PASS` or `FAIL`, with one line of evidence.

| # | Test | How | Pass if | If FAIL | Owner |
|---|---|---|---|---|---|
| 1 | **One approval, several merchants** | `createOrder` with 2 purchase units, payees `merchant_a` and `merchant_b`; approve as shopper; `authorizeOrder` | Two authorisation IDs come back | Use a **single merchant** (the platform account). Delete multi-merchant lines from the pitch | A |
| 2 | **Partial captures + void** | One authorisation of $150; capture $50 with `final_capture:false`; capture $30; void | Both captures complete; void succeeds; merchant sees $80 | Capture per **merchant** instead of per line (one purchase unit each) | A |
| 3 | **Tracking on a capture** | `addTracking(orderId, captureId, "DEMO123")` | 2xx response; tracking visible on the sandbox transaction | Store tracking in our own store and show it in the UI only | A |
| 4 | **Audit accuracy (early)** | Run `auditCompatibility` on 5 of D's cases | At least 4/5 correct with real quotes | B rewrites the prompt; narrow the categories | B |
| 5 | **Toolkit fits** | Read the toolkit README; enable only `create_order` + `get_order`; check whether `create_order` supports AUTHORIZE | It compiles with only those tools | Keep REST for orders; use the toolkit only for `get_order` | A |

**Decision meeting: Fri 24 Oct.** The team reads the five results and fixes the final pitch wording.

---

## 8. Architecture and PayPal APIs (for README and judges)

```
Shopper page (Next.js + AG Grid + PayPal button)      Merchant console (/merchant)
          │ goal, swap, approve                                │ shipped model + tracking
          ▼                                                    ▼
                    Next.js API routes (server only)
  /api/bundle ─► Gemini (constraints) + catalogue filter + auditCompatibility
  /api/audit  ─► auditCompatibility (Gemini Pro, spec sheets attached)
  /api/orders, /authorize ─► lib/paypal.ts ─► PayPal Orders v2 (AUTHORIZE)
  /api/ship   ─► checkShippedModel (code check, then Gemini Flash)
                 ├─ CAPTURE        ─► capture line + add tracking
                 └─ DO_NOT_CAPTURE ─► no PayPal call
  /api/orders/:id/close ─► void remaining authorisations
  /api/paypal/webhook   ◄─ PayPal events (verified signature)
          ▲
          │ Agent Toolkit: create_order / get_order ONLY (no capture, refund or pay tools)
```

| PayPal API | Endpoint | Used for |
|---|---|---|
| OAuth | `POST /v1/oauth2/token` | Access token (cached, refreshed before expiry) |
| Orders v2 | `POST /v2/checkout/orders` (`intent: AUTHORIZE`) | One approval for the bundle |
| Orders v2 | `POST /v2/checkout/orders/{id}/authorize` | Reserve funds after approval |
| Payments v2 | `POST /v2/payments/authorizations/{id}/capture` | Charge one confirmed line |
| Payments v2 | `POST /v2/payments/authorizations/{id}/void` | Release what was never confirmed |
| Orders v2 tracking | `POST /v2/checkout/orders/{id}/track` | Attach tracking to a capture |
| Webhooks | `POST /v1/notifications/verify-webhook-signature` | Trust only real PayPal events |
| Agent Toolkit | `create_order`, `get_order` | Agent builds and reads orders, never moves money |

---

## 9. Demo script (target 2:45)

Rehearse it every Sunday from 26 Oct. D times it.

| Time | On screen | Voice-over (say roughly this) |
|---|---|---|
| 0:00 | Photo or text of the real story (D1) | "[Name] bought a condenser mic for an interface with no phantom power. It recorded silence. The return took two weeks." |
| 0:20 | Shopper types "Podcast setup for 2 people under $800" | "AgentCart reads every manufacturer's spec sheet before anything goes in your cart." |
| 0:35 | Grid fills; one condenser mic shows **red** with the quote "Requires 48V phantom power" | "It rejected this mic, and it shows you the exact line on the spec sheet that rules it out." |
| 0:55 | Shopper swaps one part; that row re-checks | "Change anything and only that row is re-checked." |
| 1:05 | PayPal popup → approve → total shows **Authorised $X, Charged $0** | "You approve once with PayPal. Nothing is charged yet." |
| 1:20 | Merchant console: two parts shipped with matching models → grid turns **green**, "Charged $Y", tracking shown | "When a merchant ships, AgentCart checks the exact model against the one it verified. It matches, so PayPal charges for that part." |
| 1:45 | Third merchant enters a different variant → panel: **"Not charged: shipped SM58S, verified SM58-LC"** | "This merchant shipped a different variant. That part is never charged." |
| 2:00 | **Finish order** → "Released $Z" | "The rest of the hold is released. You paid only for parts confirmed to fit." |
| 2:15 | Accuracy slide: **[X]/20** on real pairings; architecture slide: "The agent can't move money" | "We measured it on 20 real spec-sheet pairings. And the AI can't charge anyone: only our server can, after a verified match." |
| 2:35 | Logo + "Approve once. Pay only for parts confirmed to fit." + links | "AgentCart." |

---

## 10. What's real vs cached (put this in the README and on `/about`)

| Component | Status |
|---|---|
| PayPal authorise, capture, void, tracking, webhooks | **Real**, PayPal sandbox |
| Compatibility audit | **Real** AI over real manufacturer spec sheets |
| Shipped-model check | **Real** AI plus exact-match code |
| Product catalogue | **Curated**: real products, prices as of [date] |
| Forum comments | **Cached**: real threads, each linked to its original |
| Merchants | Sandbox accounts operated by the team through the merchant console |

**Not built and not claimed:** live retailer stock, multi-retailer search APIs, real merchant fulfilment.

---

## 11. Risks and what we say if a judge asks

| Question | Answer |
|---|---|
| "Isn't this just an AI shopping agent?" | "Shopping agents stop at checkout. Ours decides, per part, whether PayPal charges, after approval." |
| "Can the merchant lie about the model?" | "Yes, and that's fraud. PayPal's buyer protection and disputes still apply. We stop honest mistakes and substitutions, which are the common case." |
| "Real shipping takes longer than the honour period" | "For the demo we capture inside it. In production we reauthorise. It's in the README." |
| "How do you know the AI is right?" | "[X]/20 on a hand-checked test set, a quoted reason for every verdict, and the shopper can override." |
| "What stops the AI charging people?" | "It has no capture tool. It returns JSON; only our server captures, and only on an exact or verified match." |

---

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `401` on any PayPal call | Wrong Client ID/Secret, or a **live** key with the sandbox URL | Check `.env.local`; make sure the dashboard toggle was on **Sandbox** |
| `INVALID_REQUEST` / `UNPROCESSABLE_ENTITY` | A body field is wrong (amount totals, currency) | Read `details[].issue` in the error. Item totals must add up exactly to `amount.value` |
| Popup error "intent mismatch" | Button `intent` ≠ order `intent` | Both must be authorise/`AUTHORIZE` |
| Popup won't log in | Using a real PayPal login | Use the **sandbox shopper** email/password from A2 |
| Capture fails after a few days | Honour period passed | Make a new order; for the demo, capture the same day |
| Webhooks never arrive | Localhost URL, wrong path or not deployed | Webhooks only reach the **Render** URL. Check the path is `/api/paypal/webhook` |
| Webhook verify fails | Wrong `PAYPAL_WEBHOOK_ID`, or body parsed before verifying | Use the ID from the dashboard; verify using `await req.text()` |
| Gemini returns non-JSON | Schema missing or wrong | Set `responseMimeType` and `responseSchema`; temperature 0 |
| Gemini `429` | Rate limit | Add a 5-second pause between test-set calls |
| AG Grid blank | Container has no height, or modules not registered | Give the wrapper `height: 420`; register modules |
| Render site slow on first load | Free tier was asleep | Open it a minute before the demo |
| State lost after redeploy | In-memory store | Expected. Use **Reset demo** and re-run |

---

## 13. Definition of done for the whole project

- [ ] Hosted demo runs the full section 9 script with no manual fixes
- [ ] Only the matching lines are charged in the sandbox merchant accounts (screenshot saved)
- [ ] Agent has only `create_order` / `get_order`; the README says so
- [ ] Accuracy result file committed; real score everywhere (no `[X]` left)
- [ ] README complete; a teammate ran it from scratch
- [ ] `LICENSE` (MIT) in the repo root
- [ ] Video public on YouTube, under 3:00, no copyrighted music
- [ ] Devpost submitted Tue 11 Nov with all links and teammates
- [ ] Confirmation screenshot posted in the group chat

---

## 14. Daily cheat sheet (pin this)

```
Before coding:   git checkout main && git pull && git checkout -b feat/x
Run locally:     npm run dev   → http://localhost:3000
Reset demo:      header button, or curl -X POST localhost:3000/api/reset
Test script:     npx tsx scripts/run-testset.ts
Sandbox logins:  shopper / merchant_a / merchant_b / merchant_c  (in the private chat, not the repo)
Stuck > 30 min:  check section 12, then post in chat with the exact error text
```
