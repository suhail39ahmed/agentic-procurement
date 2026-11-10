# End-to-end test plan — Agentic Procurement

Use this after the latest deploy is live. Prefer hosted URLs for submission demos; local is fine for debugging.

- Web: https://agentic-procurement-web.onrender.com
- API: https://agentic-procurement-api.onrender.com/health
- Local web: http://localhost:3000
- Local API: http://localhost:4000/health

Sandbox buyer: `OWNER_BUYER_EMAIL` / `PAYPAL_SANDBOX_PASSWORD` from your private `.env` (never commit).

Sandbox only. Order totals above the policy approval threshold require human approval.

---

## 0. Preconditions

- [ ] API `/health` returns `ok` (and `paypalEnv: sandbox` on hosted)
- [ ] Web loads Overview without console/proxy 503 errors
- [ ] Refresh shows negotiations count from Postgres (not stuck at 0)
- [ ] Buying assistant shows **Ready**; a short “hi” returns a reply (if it fails, badge becomes **Not connected** + error text)

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

## 5. Ship notice (email) → confirm delivery → capture

- [ ] From `HELD` — Inbox waits ~2s for winning seller shipment email
- [ ] Email appears in-window → auto parse → **SHIPPED** + tracking (Replay seller email if needed)
- [ ] Buyer or Supervisor: **Confirm delivery & capture** → status `CAPTURED` + capture id
- [ ] Metrics: Funds on hold / Active orders update for this session

---

## 5b. Payables agent (UI)

- [ ] **Payables** → extract sample $1.50 invoice text
- [ ] Match with PO/receipt `$1.50` → MATCHED
- [ ] Payout to sandbox seller email
- [ ] Create & send client invoice `$1.50`
- [ ] Disputes: capture/Replay buyer claim → inbox email (~4s) → agent captures fields → draft → Supervisor accept

## 5c. PayPal Agent Toolkit surfaces

- [ ] Assistant can create/send a sandbox client invoice when asked (Toolkit tools in reply metadata)
- [ ] After capture: Dispute? **Yes — Raise with PayPal** / **No — healthy** / 48h expire
- [ ] Seller desk Accept → Buyer **PayPal refund payments** nest shows REFUND · COMPLETED
- [ ] `pnpm --filter paypal mcp` starts MCP server (stdio) with sandbox token

## 5d. Partners + payables smoke

- [ ] Overview: Channel3 search → pick product → **Use market price → Review** → **Queue**
- [ ] Overview Bryntum Gantt shows **live** authorize/capture checkpoints (no dummy history)
- [ ] Automation → KERNEL fetch → opens **Payables** with page text → **Extract**
- [ ] Payables: Extract → Match (PO/receipt ≈ invoice) → Payout · optional Client invoice
- [ ] Payments: nested **Needs attention** / **Recently captured**; Captured **View** expands inline


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

1. Assistant hi + Channel3 (or Seed) → Queue → Supplier offers  
2. Checkout → PayPal approve → Authorize hold (mention >$20 approval on chairs)  
3. Payables extract + match  
4. Overview Bryntum live Gantt + Automation KERNEL  
5. Safety line: agents negotiate; policy + PayPal hold money

---

## Pass / fail notes

| Area | Pass means |
|---|---|
| Marketplace core | Buyer/seller negotiate + checkout + hold + capture on sandbox |
| UI honesty | No fake offers; checkout blocked when no eligible winner |
| Payments | Authorize only after PayPal buyer approval |
| Hosted | Section 6 completed 3× |

Record failures with: URL, negotiation id, order id, PayPal token, exact error text, timestamp (IST).
