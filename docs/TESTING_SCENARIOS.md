# ProcureAI — how a business user buys & pays (step by step)

**App:** https://agentic-procurement-web.onrender.com  

If the first load is slow, wait about a minute and refresh once (hosted demo can sleep when idle).

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
12. **Stop here** — do not click Mark shipped yet.

**You should see:** Funds on hold count go up; Needs attention shows this order with **Mark shipped**.

---

## Story B — “Same kind of buy, finish through delivery”

**Goal:** Full happy path to paid/captured.

1. Repeat a small buy like Story A (another sticky-note or low-budget request).  
2. Checkout → PayPal approve → wait for **on hold**.  
3. Click **Mark shipped** (seller delivered / you record shipment).  
4. Click **Confirm delivery & capture** (you accept delivery; PayPal takes the funds).  
5. Under **Recently captured**, click **View** to see order / capture details.

**You should see:** Status **CAPTURED**; money is no longer only on hold.

---

## Story C — “Buying chairs — needs my approval”

**Goal:** Show the over-$20 control.

1. On Overview, start a new request (or **Load demo request**).  
2. Use a chair-style brief, for example:  
   - *12 ergonomic desk chairs. Prefer durable mesh backs and 5-year warranty.*  
   - Quantity `1` (or more), max unit about `$180`, needed within `30` days.  
3. **Review** → **Queue negotiation**.  
4. When offers are ready, open **Supplier offers** → **Checkout**.  
5. On **Payments**, you should see **Owner approval required** (not PayPal yet) because the total is over **$20**.  
6. Click **Approve as owner**, then PayPal approve → hold.

**You should see:** No PayPal buttons until you approve. A ~$90–$100 order must stop at owner approval first.

---

## Story D — “A dispute showed up”

**Goal:** Owner stays in control of dispute acceptance.

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
| Want Funds on hold on screen | Finish Story A and **don’t** ship yet |
| Page empty / slow | Wait, refresh once; confirm you’re on the hosted demo URL |
