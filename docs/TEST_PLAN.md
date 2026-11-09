# End-to-end test plan — Agentic Procurement

Use this after the latest deploy is live. Prefer hosted URLs for submission demos; local is fine for debugging.

- Web: https://agentic-procurement-web.onrender.com
- API: https://agentic-procurement-api.onrender.com/health
- Local web: http://localhost:3000
- Local API: http://localhost:4000/health

Sandbox buyer: `OWNER_BUYER_EMAIL` / `PAYPAL_SANDBOX_PASSWORD` from your private `.env` (never commit).

**Spend guard:** keep every sandbox charge ≤ **$2** (`DEMO_MAX_USD=2`). Demo seed uses qty `1` / max unit `$2.00` (micro sellers). Do not use large chair budgets.

---

## 0. Preconditions

- [ ] API `/health` returns `ok` (and `paypalEnv: sandbox` on hosted)
- [ ] Web loads Overview without console/proxy 503 errors
- [ ] Refresh shows negotiations count from Postgres (not stuck at 0)
- [ ] Buying assistant shows **Connected** (not “Not connected”)

---

## 1. Request composer (no AI until queue)

- [ ] Click **Seed demo (1 click)** → queues chairs negotiation and opens Supplier offers
- [ ] Click **Load demo request** → form fills chairs demo without queueing
- [ ] Change priority / qty / max unit price / needed-by days
- [ ] **Review draft** → summary appears; edit works
- [ ] **Save draft** → appears under Request drafts (session-only)
- [ ] Saving draft does **not** start negotiation or PayPal

---

## 2. Agent-to-agent negotiation

- [ ] From review, **Queue negotiation**
- [ ] Status moves QUEUED → RUNNING → SUCCEEDED (or FAILED)
- [ ] Overview **Negotiation feed** AG Grid updates statuses/payments without full remount
- [ ] **Supplier offers** shows selected negotiation brief + id
- [ ] **Live negotiation stream (SSE)** shows per-seller OFFER/COUNTER lines while running
- [ ] AG Grid lists sellers with unit price, lead time, match score, Eligible
- [ ] Over-budget / late offers show Eligible = No and block checkout
- [ ] In-budget + on-time offer exists for demo budget (~$200+/chair, qty 1)

Negative case:

- [ ] Queue with max unit price `$8` → SUCCEEDED but **No eligible winner** / checkout disabled

---

## 3. Buying assistant (advice only)

- [ ] Ask: “What’s the difference between authorize and capture?”
- [ ] Reply arrives; does **not** create PayPal orders or capture
- [ ] Ask about current offers if a negotiation is selected

---

## 4. Checkout → PayPal approve → Authorize hold

- [ ] Select eligible SUCCEEDED negotiation → **Checkout winning offer**
- [ ] Payments shows order id, status `APPROVED`, amount, approve link
- [ ] Click **Authorize hold** *before* PayPal approve → clear error that buyer must Complete Purchase first
- [ ] Open **Approve on PayPal** as sandbox buyer → **Complete Purchase**
- [ ] Land on `/paypal/return` (Buyer approval received)
- [ ] Back to **Payments & orders** → **Authorize hold** → status `HELD` + authorization id

---

## 5. Ship → confirm delivery → capture

- [ ] From `HELD` → **Mark shipped** → status `SHIPPED` + tracking
- [ ] **Confirm delivery & capture** → status `CAPTURED` + capture id
- [ ] Metrics: Funds on hold / Active orders update for this session

---

## 5b. Payables agent (UI)

- [ ] **Payables** → extract sample $1.50 invoice text
- [ ] Match with PO/receipt `$1.50` → MATCHED
- [ ] Payout to sandbox seller email (≤$2)
- [ ] Create & send client invoice `$1.50`
- [ ] Disputes: simulate → draft → owner-approved accept

## 5c. PayPal Agent Toolkit surfaces

- [ ] Assistant can create/send a sandbox client invoice when asked (Toolkit tools in reply metadata)
- [ ] Payments → **Simulate CUSTOMER.DISPUTE.CREATED** → dispute appears
- [ ] **Draft response** stores agent draft; **Approve accept_dispute_claim** requires draft + `{approved:true}`
- [ ] `pnpm --filter paypal mcp` starts MCP server (stdio) with sandbox token

## 5d. Partners + payables smoke

- [ ] Overview: Channel3 **Use for RFQ** fills brief ≤$2 → Review → **Queue negotiation** (sellers see Channel3 product RFQ)
- [ ] Automation: Channel3 enrich also loads Overview RFQ
- [ ] Bryntum Gantt loads; Simulate late capture / refund / dispute moves or flags bars; Reset plan restores baseline
- [ ] KERNEL fetch → opens **Payables** with page text → **Extract** (or paste sample invoice text with no URL)
- [ ] Payables: Extract → Match (PO/receipt ≈ $1.50) → Payout · optional Client invoice


---

## 6. Hosted production smoke (issue #43)

Repeat the full path on the Render web URL **3 times** (fresh negotiation each run):

| Run | Negotiate | Checkout | PayPal approve | Authorize | Ship | Capture |
|---|---|---|---|---|---|---|
| 1 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| 2 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| 3 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

## 7. Security / ops smoke

- [ ] API refuses live PayPal (`PAYPAL_ENV` must be sandbox)
- [ ] `.env` is not in git; secret scan script / CI present
- [ ] Cancel PayPal checkout → `/paypal/cancel` → no funds held
- [ ] Audit page `/audit/[orderId]` loads for a known order when configured

---

## 8. Demo script (under 3 minutes)

1. Load demo request → Queue negotiation  
2. Show Supplier offers ranking + Eligible column  
3. Checkout → PayPal Complete Purchase → Authorize hold  
4. Mark shipped → Confirm delivery & capture  
5. One assistant question: “Who can capture funds?” (answer: owner only)

---

## Pass / fail notes

| Area | Pass means |
|---|---|
| Marketplace core | Buyer/seller negotiate + checkout + hold + capture on sandbox |
| UI honesty | No fake offers; checkout blocked when no eligible winner |
| Payments | Authorize only after PayPal buyer approval |
| Hosted | Section 6 completed 3× |

Record failures with: URL, negotiation id, order id, PayPal token, exact error text, timestamp (IST).
