# ProcureAI — demo & test scenarios

**Demo:** https://agentic-procurement-web.onrender.com  
**API:** https://agentic-procurement-api.onrender.com/health  

Hard-refresh (`Ctrl+Shift+R`). Free Render cold start may need 30–60s.

**Policy:** order total ≤ **$20** auto-allow; above **$20** → REQUIRE_APPROVAL before Pay.  
**Hold rule:** funds stay authorized through **HELD** and **SHIPPED**; money moves only on **CAPTURE**. PayPal popup approve **auto-runs** authorize hold → **HELD**. Use **Authorize hold** only after the fallback approve link.

---

## Run these 4, then Payables

| # | Scenario | Goal |
|---|---|---|
| **1** | Sticky notes → hold | Funds on hold (**HELD**) — stop before ship |
| **2** | Sticky notes → capture | Full path to **CAPTURED** |
| **3** | Chair / >$20 | Human approval before pay |
| **4** | Dispute | Simulate dispute → draft → owner-gated accept |
| then | **Payables** | Extract → Match → optional Payout |

Optional after that: Overview Bryntum dots, Automation → KERNEL.

---

### 1 — Funds on hold (≤ $20)

| Step | You do | Pass if |
|---|---|---|
| 1.1 | Channel3 `office sticky notes pack` → **Use market price → Review** → **Queue** | **SUCCEEDED**; sellers near ceiling |
| 1.2 | **Offers** on that **new** row → **Checkout winning offer** | Payments opens; PayPal buttons |
| 1.3 | Sandbox buyer approves in popup | Status → **HELD** automatically (Funds on hold) |
| 1.4 | **Stop** — do not Mark shipped | Metric **Funds on hold** ≥ 1; Needs attention shows **Mark shipped** |

---

### 2 — Full capture (second sticky / small RFQ)

| Step | You do | Pass if |
|---|---|---|
| 2.1 | Queue another ≤ $20 RFQ → Offers → Checkout → PayPal approve | **HELD** |
| 2.2 | **Mark shipped** | **SHIPPED** (still on hold) |
| 2.3 | **Confirm delivery & capture** | **CAPTURED**; Recently captured → **View** expands inline |

---

### 3 — Approval required (>$20)

| Step | You do | Pass if |
|---|---|---|
| 3.1 | Chairs RFQ (e.g. qty 1–12, max unit ~$180) → Queue → Offers → Checkout | **REQUIRE_APPROVAL** before pay |
| 3.2 | Owner approve → Pay / PayPal approve | Hold can proceed; no silent capture |

**Sample brief:** `12 ergonomic desk chairs. Prefer durable mesh backs and 5-year warranty.` · Qty `1` · Max `180` · 30 days.

---

### 4 — Dispute (before Payables)

| Step | You do | Pass if |
|---|---|---|
| 4.1 | **Payments & orders** → Disputes → **Simulate CUSTOMER.DISPUTE.CREATED** | Dispute id appears |
| 4.2 | **Draft response** | Agent draft stored |
| 4.3 | **Approve accept_dispute_claim** | Runs only with owner approval; clear notice |

---

### Then — Payables

| Step | You do | Pass if |
|---|---|---|
| P.1 | **Payables** → Extract (sample text) | Vendor / amount extracted |
| P.2 | PO + receipt = invoice amount → **Match** | **MATCHED** |
| P.3 | Optional **Payout** / client invoice | Sandbox ok or clear error |
| P.4 | Optional **Automation** → KERNEL fetch | Opens Payables with page text |

---

## Recording order (≈3 min cut)

1. Overview + assistant hi  
2. Scenario **1** (stop at HELD — show Funds on hold)  
3. Scenario **2** through capture (or skip ship/capture if short on time)  
4. Scenario **4** dispute simulate + draft  
5. Jump to **Payables** extract + match  
6. Safety line: agents negotiate; policy + PayPal hold money  

Scenario **3** (approval) if you have ~20s left.

---

## Quick checks

| Check | Expected |
|---|---|
| API `/health` | `ok` + `paypalEnv: sandbox` |
| Capture before approve | Error; no capture |
| Old Supplier offers row | Frozen snapshot — use a **new** SUCCEEDED negotiation |
| Authorize hold after popup | Already **HELD** — button is for fallback link only |
