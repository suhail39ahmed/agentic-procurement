# ProcureAI — how a business user buys & pays (step by step)

**App:** https://agentic-procurement-web.onrender.com  

If the first load is slow, wait about a minute and refresh once (hosted demo can sleep when idle).

### Demo logins

| Role | Username / password | Can do |
|---|---|---|
| **Buyer** | `buyer` / `buyer` | RFQ → PayPal → ship email → capture; **opens dispute claims** + drafts claim wording |
| **Supervisor** | `supervisor` / `supervisor` | **Over-$20 spend approve** only (plus full buy path). Not for dispute accept |
| **Seller** | `seller` / `seller` | **Dispute accept only** — `accept_dispute_claim` via PayPal Toolkit |

Use the login screen (or sidebar Buyer / Supervisor / Seller switch).

---

## What you’re doing in plain terms

You run a small business buying supplies.

1. **Marketplace** — You say what you need. AI buyer agents negotiate with AI sellers. You pick a winner, pay with PayPal, and money stays **on hold** until you confirm delivery.  
2. **Payables** — A supplier invoice arrives. You extract it, match it to PO/receipt, then pay out.

**Money rules you should know**

- Orders **$20 or under** can proceed without an extra Supervisor approval step.  
- Orders **over $20** need **Supervisor approval** before payment.  
- After the buyer approves in PayPal, funds go **on hold** (not taken yet).  
- ~4s later the **winning seller** sends a shipment email in the Payments inbox; the AI agent reads it, captures carrier/tracking, and moves to **SHIPPED**.  
- Money is only **captured** when Buyer or Supervisor clicks **Confirm delivery & capture**.  
- AI can negotiate and advise — it cannot capture money by itself.

---

## Day-in-the-life path (4 buying stories, then AP)

| Story | Business goal |
|---|---|
| **A** | Buy a cheap office item and leave money **on hold** briefly (watch seller email) |
| **B** | Complete a buy through **delivery confirmed / paid** |
| **C** | Buy something **over $20** and go through **Supervisor approval** |
| **D** | Handle a **customer dispute** |
| then | Process a **supplier invoice** in Payables |

---

## Story A — “I need sticky notes; hold the money”

**Goal:** See **Funds on hold**, then the live seller-email inbox.

1. Open **Overview**.  
2. In Channel3 / catalog search, type `office sticky notes pack` → **Search**.  
3. Pick a product around **$7–$20**.  
4. Click **Use market price → Review**.  
5. Click **Queue negotiation** (start the buy).  
6. Wait until the request **succeeds**.  
7. Open **Supplier offers** for **this new** request (not an old one).  
8. Check the table: prices, delivery days, **Eligible**.  
9. Click **Checkout winning offer**.  
10. On **Payments**, approve as the PayPal sandbox buyer in the popup.  
11. Status becomes **HELD** — Inbox waits ~4s → **Email received** → AI agent captures carrier/tracking (shown under the email) → **SHIPPED**.  
12. Optional stop: leave it **SHIPPED** without capturing if you only want hold + ship for the video.

**You should see:** Funds on hold, then an in-window seller email from the winning supplier, then **SHIPPED**.

---

## Story B — “Same kind of buy, finish through delivery”

**Goal:** Full happy path to paid/captured.

1. Repeat a small buy like Story A (another sticky-note or low-budget request).  
2. Checkout → PayPal approve → **HELD** → seller email (~4s) → agent captures tracking → **SHIPPED**.  
3. Stay as **Buyer** (or Supervisor) → **Confirm delivery & capture**.  
4. Under **Recently captured**, click **View**.

**You should see:** **HELD** → inbox email → **SHIPPED** → **CAPTURED** after Confirm. No Load sample / paste / Extract steps.

---

## Story C — “Buying chairs — needs Supervisor approval”

**Goal:** Show the over-$20 control. **Do not look for the message under Disputes** — approval is a panel at the top of Payments.

1. Sign in as **Buyer**.  
2. On Overview, start a new request (or **Load demo request** — opens Review ready to Queue).  
3. Use a chair-style brief, for example:  
   - *12 ergonomic desk chairs. Prefer durable mesh backs and 5-year warranty.*  
   - Quantity `1` (or more), max unit about `$180`, needed within `30` days.  
4. **Review** → **Queue negotiation** (wait until status **SUCCEEDED** — AI can take ~20–40s).  
5. Open **Supplier offers** for **this** request → **Checkout winning offer**.  
6. App jumps to **Payments & orders**. Right under the checkpoints you must see a highlighted panel: **Supervisor approval required** with total, Deny, **Switch to Supervisor**, and **Approve as Supervisor**.  
7. In **Needs attention**, the same request appears as **PENDING_APPROVAL**. **Review approval** re-opens the panel (works after refresh too).  
8. Click **Switch to Supervisor** (or sidebar) → **Approve as Supervisor** → PayPal approve → hold → seller email → SHIPPED → Confirm capture (Buyer or Supervisor).

**You should see:** Checkout does **not** create PayPal until Supervisor approves. The request stays in Needs attention as PENDING_APPROVAL until Approve.  
**Fail if:** Headphones/chairs over $20 vanish from Payments, or you only see a toast under Disputes with no approval panel / Approve button.

---

## Story D — “Raise to PayPal → Seller desk → Refund received”

**Goal:** Different products per role. Any captured order can raise a dispute. Seller desk is separate (not the buy chrome).

```
Buyer / Supervisor desk          PayPal            Seller desk (separate app chrome)
  |                                |                      |
  |-- Raise dispute (captured) --->|                      |
  |   under Disputes               |-- notify ----------->|
  |                                |                      |-- Accept (refund)
  |<-- Refund received ------------|<-- closed -----------|
```

### Full path
`Buy → Pay → Ship → Capture → Satisfied / Leave open / Raise`

- **Satisfied — received** → order healthy, no dispute
- **Leave open** → still can raise or mark satisfied later
- **Raise with PayPal** → Seller desk Accept → Buyer **PayPal refund payment**
- **48h** with no raise while open → auto **healthy**

### Buyer or Supervisor
1. Capture → **Recently captured** shows Satisfied / Leave open / Raise with PayPal.
2. Raise → case under **Disputes**.
3. After Seller accept → **PayPal refund payments**.

### Seller desk
5. Separate product with tabs: **RFQ inbox** · **Seller agents** · **Fulfillment** (preview) · **Payouts & invoices** (live send invoice + payouts + email received) · **Disputes** (live Accept).

**Seller money path:** Send invoice → ~3s Buyer AP received → after Buyer Match/Payout, **Payouts completed** fills in.

| Product | Dispute Yes/No | Buy path | Accept → PayPal refund |
|---|---|---|---|
| Buyer | Yes (48h) | Yes | Sees refund payment |
| Supervisor | Yes (same desk) | Yes + over-$20 | Sees refund payment |
| Seller desk | No | No | Creates refund |

---

## Then — “Pay the supplier invoice” (Payables)

**Goal:** AP track — three intake paths, one extract → match → payout → Seller sees money.

1. Open **Payables** as Buyer.  
2. Intake: **Storage vault** / **From email** / **Upload PDF** → extract.  
3. Invoice lands in **Needs match** → set PO/receipt same amount → **Match** → moves to **Ready to pay**.  
4. **Payout** → invoice moves to **Paid** queue.  
5. Switch **Seller desk → Payouts & invoices** → **Payouts completed** shows that batch.

### Create & send (Seller → Buyer AP)
6. **Seller desk → Payouts & invoices → Create & send** (PayPal invoice to Buyer AP).  
7. Appears under **Invoices you sent** → ~3s **Buyer AP received**.  
8. Buyer Payables extracts / matches / pays → Seller **Payouts completed**.  

Create & send is **not** on Buyer Payables (that desk only intakes → match → payout).

**Render note:** PDF vault + extract/payout rows live in Postgres (no ephemeral disk).

---

## Suggested order for a short walkthrough / video

1. Overview — what the workspace is; ask the buying assistant a quick question.  
2. Story A or B — sticky notes through PayPal hold + live seller email → SHIPPED (and capture for B).  
3. Story C — over-$20 Supervisor approve.  
4. Story D — dispute draft / accept.  
5. Payables — extract → match → payout.  

Add **Story C** if you have ~20 more seconds.

---

## Common “why isn’t this working?” notes

| Situation | What to do |
|---|---|
| Offers look wrong / old prices | Open a **new** finished request — old offer lists don’t refresh |
| Authorize hold does nothing after PayPal popup | Hold already ran — look for **HELD** / seller Inbox |
| Want Funds on hold on screen | Finish Story A and watch the Inbox for ~2s before SHIPPED |
| Order stuck on HELD | Click **Replay seller email** on the hold row |
| Headphones / over-$20 order missing from Payments | Refresh; open **Needs attention** — status should be **PENDING_APPROVAL**. Click **Review approval**, switch to Supervisor, Approve |
| Checkout winning → only a toast under Disputes | Hard refresh; look for **Supervisor approval required** panel under checkpoints (above Needs attention). Switch to Supervisor → Approve |
| Page empty / slow | Wait, refresh once; confirm you’re on the hosted demo URL |

---

## Email integration (locked demo vs real Gmail)

**Locked for this demo (live now):** after PayPal authorize → wait 2s → generate a shipment email **from the winning supplier id** → show it in the Payments Inbox → parse tracking → `seller-shipped` → **SHIPPED**. No new credentials.

**If you want real Gmail later, provide:**

1. Google Cloud project with **Gmail API** enabled  
2. OAuth client (web) + refresh token for the buyer inbox (or a shared demo mailbox)  
3. Preferred: Pub/Sub push watch on that inbox, or poll every few seconds during HELD  
4. Optional: SMTP/API for the *seller* side to actually send mail (otherwise sellers stay simulated)

Until those are wired, the in-app seller Inbox is the intentional demo path.
