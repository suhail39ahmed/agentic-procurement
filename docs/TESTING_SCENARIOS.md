# ProcureAI — how a business user buys & pays (step by step)

**App:** https://agentic-procurement-web.onrender.com  

If the first load is slow, wait about a minute and refresh once (hosted demo can sleep when idle).

### Demo logins

| Role | Username / password | Can do |
|---|---|---|
| **Buyer** | `buyer` / `buyer` | RFQ, negotiate, checkout, PayPal approve; paste shipment email → Apply ship |
| **Supervisor** | `supervisor` / `supervisor` | **Supervisor approval** for spends **over $20**, **Confirm delivery & capture**, accept disputes |

Use the login screen (or sidebar Buyer/Supervisor switch). Over-$20 checkout stops until a **Supervisor** approves.

---

## What you’re doing in plain terms

You run a small business buying supplies.

1. **Marketplace** — You say what you need. AI buyer agents negotiate with AI sellers. You pick a winner, pay with PayPal, and money stays **on hold** until you confirm delivery.  
2. **Payables** — A supplier invoice arrives. You extract it, match it to PO/receipt, then pay out.

**Money rules you should know**

- Orders **$20 or under** can proceed without an extra owner approval step.  
- Orders **over $20** need **your approval** before payment.  
- After the buyer approves in PayPal, funds go **on hold** (not taken yet).  
- Funds stay on hold while the order is held or marked shipped.  
- Money is only **captured** when you confirm delivery.  
- AI can negotiate and advise — it cannot capture money by itself.

---

## Day-in-the-life path (4 buying stories, then AP)

| Story | Business goal |
|---|---|
| **A** | Buy a cheap office item and leave money **on hold** |
| **B** | Complete a buy through **delivery confirmed / paid** |
| **C** | Buy something **over $20** and go through **owner approval** |
| **D** | Handle a **customer dispute** |
| then | Process a **supplier invoice** in Payables |

---

## Story A — “I need sticky notes; hold the money”

**Goal:** See **Funds on hold** without finishing the order.

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
11. Status should become **HELD** / **Funds on hold** (hold is placed for you after approve).  
12. **Stop here** — leave it **HELD**. Do not paste a shipment email or click **Apply ship notice** yet.

**You should see:** Funds on hold count go up; Needs attention shows this order still **HELD** (stays held until you apply a ship notice in Story B).

---

## Story B — “Same kind of buy, finish through delivery”

**Goal:** Full happy path to paid/captured.

1. Repeat a small buy like Story A (another sticky-note or low-budget request).  
2. Checkout → PayPal approve → status **HELD** (funds stay here until you apply a ship notice).  
3. On Payments, paste the seller shipment email from **Gmail** (or **Load sample email**) → **Extract tracking** → **Apply ship notice → SHIPPED**.  
4. Switch to **Supervisor** → **Confirm delivery & capture** (money is not taken until this click).  
5. Under **Recently captured**, click **View**.

**You should see:** Order remains **HELD** until email apply; then **SHIPPED**; **CAPTURED** only after Supervisor confirm.  
**Gmail:** copy/paste from Gmail is the sandbox path (no OAuth inbox yet). Full Gmail API can be added later.

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
7. In **Needs attention**, the same request appears as **PENDING_APPROVAL** · Needs Supervisor approval before PayPal. **Review approval** re-opens the panel (works after refresh too).  
8. Click **Switch to Supervisor** (or sidebar) → **Approve as Supervisor** → PayPal approve → hold.

**You should see:** Checkout does **not** create PayPal until Supervisor approves. The request stays in Needs attention as PENDING_APPROVAL until Approve. The approval card is above Needs attention — not buried in Disputes.  
**Fail if:** Headphones/chairs over $20 vanish from Payments, or you only see a toast under Disputes with no approval panel / Approve button.

---

## Story D — “A dispute showed up”

**Goal:** Supervisor stays in control of dispute acceptance.

1. Go to **Payments & orders**.  
2. In **Disputes**, click **Simulate CUSTOMER.DISPUTE.CREATED** (demo stand-in for a real PayPal dispute).  
3. Open the dispute → **Draft response** (assistant prepares wording).  
4. Only when you’re ready, **Approve accept_dispute_claim**.

**You should see:** Draft first; accept only after you approve — not automatic.

---

## Then — “Pay the supplier invoice” (Payables)

**Goal:** AP track after the buying stories.

1. Open **Payables**.  
2. Keep (or paste) the sample invoice text → **Extract invoice**.  
3. Set PO and receipt amounts to the **same** invoice amount → **Match**.  
4. When matched, optionally run **Payout** to the sandbox seller email.  
5. Optional: create/send a **client invoice**.  
6. Optional: **Automation** → paste a public invoice page URL → **Fetch page text** (loads Payables for extract).

**You should see:** Extracted vendor/amount → **MATCHED** → payout available when matched.

---

## Suggested order for a short walkthrough / video

1. Overview — what the workspace is; ask the buying assistant a quick question.  
2. **Story A** — stop at Funds on hold.  
3. **Story B** — finish one order to captured (or shorten if time is tight).  
4. **Story D** — dispute draft.  
5. Jump to **Payables** — extract + match.  
6. Closing line: agents negotiate; you and PayPal control the money (hold until you confirm delivery; over $20 needs approval).

Add **Story C** if you have ~20 more seconds.

---

## Common “why isn’t this working?” notes

| Situation | What to do |
|---|---|
| Offers look wrong / old prices | Open a **new** finished request — old offer lists don’t refresh |
| Authorize hold does nothing after PayPal popup | Hold already ran — look for **HELD** / Funds on hold |
| Want Funds on hold on screen | Finish Story A and **don’t** apply a ship notice yet |
| Order stuck on HELD / nothing in SHIPPED | Expected until you paste email → **Extract tracking** → **Apply ship notice** |
| No real Gmail handy | Use **Load sample email** on Payments, then Extract → Apply |
| Checkout winning → only a toast under Disputes | Hard refresh; look for **Supervisor approval required** panel under checkpoints (above Needs attention). Switch to Supervisor → Approve |
| Headphones / over-$20 order missing from Payments | Refresh; open **Needs attention** — status should be **PENDING_APPROVAL**. Click **Review approval**, switch to Supervisor, Approve |
| Page empty / slow | Wait, refresh once; confirm you’re on the hosted demo URL |
