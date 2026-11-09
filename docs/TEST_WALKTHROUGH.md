# ProcureAI — careful test walkthrough

**URL:** https://agentic-procurement-web.onrender.com  
Hard-refresh first (`Ctrl+Shift+R`). Cold start may need ~60s + one refresh.

---

## What to source (for video)

| Field | Value |
|---|---|
| **What** | 12 ergonomic desk chairs (durable mesh, 5-year warranty) |
| **Qty** | 12 |
| **Max unit price** | $180 USD |
| **Needed within** | 30 days |
| **Priority** | Lowest cost |

Chair checkouts are **>$20** → REQUIRE_APPROVAL. For auto-allow, use Channel3 sticky notes / low unit ceilings (total ≤ $20).

**Important:** Supplier offers are frozen when you Queue. Open a **new** negotiation after deploys — old rows will not re-price.

---

## Part 0 — Alive

| Step | You do | You should see |
|---|---|---|
| 0.1 | Open URL | Overview · Marketplace + Payables |
| 0.2 | Buying assistant badge | **Ready** |
| 0.3 | Optional API health | `status: ok`, `paypalEnv: sandbox` |

---

## Part 1 — Buying assistant

| Step | You do | You should see |
|---|---|---|
| 1.1 | `Say hi` → Send | Short hello |
| 1.2 | `How does authorize then capture work?` | Hold → ship → owner capture |

---

## Part 2 — RFQ

**Path A — Seed:** **Seed demo (1 click)** → chairs brief queues.

**Path B — Type:** fill brief / qty / max / days → **Review draft**.

**Path C — Channel3:** search → pick product → **Use market price → Review** → Queue. Catalog is live Channel3 API (not Postgres); Postgres stores the RFQ only after Queue.

---

## Part 3 — Negotiate

| Step | You do | You should see |
|---|---|---|
| 3.1 | **Queue negotiation** | Row in Requests / Negotiations |
| 3.2 | Wait → **SUCCEEDED** | Open that row in **Supplier offers** |
| 3.3 | AG Grid + SSE | Prices, lead times, Eligible |

---

## Part 4 — PayPal

| Step | You do | You should see |
|---|---|---|
| 4.1 | **Checkout winning offer** | Payments active order / inbox |
| 4.2 | Sandbox buyer approve | Popup or approve URL |
| 4.3 | **Authorize hold** (or auto after PayPal) | **HELD** → Inbox waiting |
| 4.4 | Wait ~2s (or **Replay seller email**) | Winning seller email appears → auto **SHIPPED** |
| 4.5 | Buyer or Supervisor **Confirm delivery & capture** | **CAPTURED**; nested Payments queues update |

---

## Part 5 — Payables

**Payables** → Extract sample → Match (PO/receipt = invoice amount) → optional Payout / client invoice.

---

## Part 6 — Bryntum + KERNEL

| Step | You do | You should see |
|---|---|---|
| 6.1 | **Overview** Gantt | Live checkpoints only (no dummy bars) |
| 6.2 | Hover status dots | Payment status tooltip |
| 6.3 | **Automation** → KERNEL fetch | Opens Payables with page text |

---

## Recording order (~15 min rehearsal → ≤3 min cut)

1. Part 0–1  
2. Channel3 or Seed → Queue → Offers  
3. Checkout → Authorize (mention >$20 approval if chairs)  
4. Payables extract + match  
5. Overview Gantt + one KERNEL fetch  
