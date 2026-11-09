# ProcureAI — careful test walkthrough

**URL:** https://agentic-procurement-web.onrender.com  
Hard-refresh first (`Ctrl+Shift+R`). If the page hangs, wait ~60s (Render cold start) and refresh once.

---

## What we are sourcing (start here)

Use this RFQ so the story is clear for the video and for you:

| Field | Value |
|---|---|
| **What** | 12 ergonomic desk chairs (durable mesh, 5-year warranty) |
| **Qty** | 12 |
| **Max unit price** | $180 USD |
| **Needed within** | 30 days |
| **Priority** | Lowest cost |

**Why this:** sellers counter on chairs; Channel3 sticky-note RFQs stay under the **$20** auto-allow band; chair checkouts hit **REQUIRE_APPROVAL** (>$20).

*(Optional later: Channel3 “office sticky notes” for a catalog-sourced RFQ — fine for a second run.)*

---

## Part 0 — Site is alive (1 min)

| Step | You do | You should see |
|---|---|---|
| 0.1 | Open the URL | Overview with dual-track cards (Marketplace + Payables) |
| 0.2 | Look at Buying assistant badge | **Ready** (not Not connected) |
| 0.3 | Optional: open API health | `status: ok`, `paypalEnv: sandbox` |

---

## Part 1 — Buying assistant (2 min)

| Step | You do | You should see |
|---|---|---|
| 1.1 | In Buying assistant type: `Say hi` → Send | Badge **Thinking…** then **Ready**; short hello in the chat |
| 1.2 | Ask: `How does authorize then capture work?` | Short answer: hold → ship → owner confirms → capture. Page should **not** jump to top |
| 1.3 | Ask: `What should we source today?` | Can suggest chairs / RFQ; keep it short |

**Pass:** replies stay short; no huge markdown tables; scroll stays on the assistant card.

---

## Part 2 — Create the RFQ (what we are sourcing)

### Path A — Seed (fastest)

| Step | You do | You should see |
|---|---|---|
| 2A.1 | Click **Seed demo** / load demo brief if shown | Composer fills with chair (or sample) brief |
| 2A.2 | Or click the example chip for chairs | Brief: *12 ergonomic desk chairs…* |

### Path B — Type it yourself

| Step | You do | You should see |
|---|---|---|
| 2B.1 | Overview → **Your procurement brief** | Empty composer |
| 2B.2 | Paste: `12 ergonomic desk chairs. Prefer durable mesh backs and 5-year warranty.` | Text in textarea |
| 2B.3 | Priority: **Lowest cost** | Selected |
| 2B.4 | Quantity `12`, Max unit `180`, Currency **USD**, Needed within `30` | Fields filled |
| 2B.5 | **Review draft** | Summary of brief / qty / $180 / 30 days |

### Path C — Channel3 (live catalog → RFQ ceiling)

Channel3 results are **not** stored in Postgres. Each Search calls Channel3’s API. Postgres only stores the RFQ/negotiation **after** you Queue.

| Step | You do | You should see |
|---|---|---|
| 2C.1 | Overview → search `office sticky notes pack` → **Search** | Dropdown of products with **prices** (and retailer when available) |
| 2C.2 | Pick one → **Use market price → Review** | Jumps straight to Review; brief says “match or beat Channel3 market unit price ≤ $X” |
| 2C.3 | **Queue negotiation** | RFQ saved in Postgres; sellers compete against that market ceiling |

---

## Part 3 — Negotiate with sellers

| Step | You do | You should see |
|---|---|---|
| 3.1 | On review screen → **Queue negotiation** | Notice that negotiation was queued; appears under Requests / feed |
| 3.2 | Wait 30–90s (refresh / watch status) | Status moves toward **SUCCEEDED** (may show RUNNING first) |
| 3.3 | Open **Supplier offers** | AG Grid with seller-a/b/c/d style rows: price, lead time, score, eligible |
| 3.4 | Watch live stream (SSE) | Buyer/seller messages scrolling |
| 3.5 | Ask assistant: `Which offer should I pick?` | Short pick of **best eligible** seller + one tradeoff |

**Pass:** at least one **eligible** offer if budget/deadline allow; grid updates without full page reload.

---

## Part 4 — PayPal checkout (sandbox money path)

Do this only after Part 3 succeeded and you have an eligible winner.

| Step | You do | You should see |
|---|---|---|
| 4.1 | **Checkout winning offer** | Checkout created; PayPal approve link |
| 4.2 | Open approve link → log in as **PayPal sandbox personal** buyer → complete purchase | Redirect / return to app |
| 4.3 | Back in app → **Authorize hold** | Order **HELD** (funds held, **not** captured) |
| 4.4 | (Optional) Mark shipped → **Confirm delivery / capture** | Order **CAPTURED** |

**Fail if:** capture works before approve, or assistant claims it captured for you.

---

## Part 5 — Payables (AP track)

| Step | You do | You should see |
|---|---|---|
| 5.1 | Sidebar → **Payables** | Sample invoice text already there |
| 5.2 | **Extract invoice** | Extracted amount/vendor; success notice |
| 5.3 | Set PO + receipt to the **same** amount as invoice → **Match** | **MATCHED** |
| 5.4 | (Optional) **Payout** to sandbox seller email | Payout submitted *or* clear sandbox message |
| 5.5 | (Optional) Client invoice create/send | Toolkit invoice id / sent note |

---

## Part 6 — Bryntum schedule (Overview)

| Step | You do | You should see |
|---|---|---|
| 6.1 | **Overview** | Bryntum Gantt with completed + live negotiation checkpoints |
| 6.2 | Hover a status dot | Tooltip with milestone / payment status |
| 6.3 | Queue a new RFQ or capture an order | Chart refreshes with new checkpoints |

---

## Part 7 — Human approval (>$20) — optional

| Step | You do | You should see |
|---|---|---|
| 7.1 | Checkout a chair RFQ (total clearly **over $20**) | Policy **REQUIRE_APPROVAL** then owner approve → Pay becomes available |
| 7.2 | Confirm money does **not** move without owner approval | No silent capture |

---

## Suggested order for a first full pass (~15 min)

1. Part 0 → Part 1 (assistant)  
2. Part 2 Path B (chairs RFQ) → Part 3 (negotiate + offers)  
3. Part 4 through Authorize hold  
4. Part 5 extract + match  
5. Part 6 Bryntum simulate late capture  

Then record the same path for the Devpost video.
