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

**Why this:** total can stay under the $250 auto-allow band if unit prices stay near budget; sellers will counter; you get a real AG Grid comparison.

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

### Path C — Channel3 (catalog)

| Step | You do | You should see |
|---|---|---|
| 2C.1 | Channel3 search (e.g. `office sticky notes pack`) → **Use for RFQ** | Brief + budget prefilled from catalog |
| 2C.2 | **Review draft** | Channel3 product named in the brief |

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

## Part 6 — Bryntum rescheduler

| Step | You do | You should see |
|---|---|---|
| 6.1 | **Automation** | Bryntum Gantt with authorize / delivery / capture / payout |
| 6.2 | **Simulate late capture** | Bars move or flag **late**; agent log line |
| 6.3 | **Simulate refund** or **dispute** | Flags change |
| 6.4 | **Reset plan** | Baseline milestones restored |

---

## Part 7 — Human approval (>$250) — optional

| Step | You do | You should see |
|---|---|---|
| 7.1 | New RFQ with total clearly **over $250** (e.g. qty 12 × max $180 = $2160 potential) | Negotiation may complete, but payment path hits **REQUIRE_APPROVAL** — not auto-pay |
| 7.2 | Confirm money does **not** move without owner approval | No silent capture |

---

## Suggested order for a first full pass (~15 min)

1. Part 0 → Part 1 (assistant)  
2. Part 2 Path B (chairs RFQ) → Part 3 (negotiate + offers)  
3. Part 4 through Authorize hold  
4. Part 5 extract + match  
5. Part 6 Bryntum simulate late capture  

Then record the same path for the Devpost video.
