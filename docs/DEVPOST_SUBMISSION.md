# Devpost submission pack (ProcureAI)

Use this when filling the Devpost form. **Demo video** is the only item left for you to record.

## General info

**Project name** (≤60 chars)

```
ProcureAI — Agentic Procurement & Payables
```

**Elevator pitch** (≤200 chars)

```
Buyer & seller AIs negotiate; PayPal authorize→capture after delivery. Dual-track marketplace + AP extract/match/payout, Channel3 RFQs, KERNEL invoices, Bryntum live payment Gantt.
```

**Hosted demo URL**

```
https://agentic-procurement-web.onrender.com
```

API health: `https://agentic-procurement-api.onrender.com/health`

**Public repo**

```
https://github.com/suhail39ahmed/agentic-procurement
```

- License: **MIT** (`LICENSE` at repo root — already detected by GitHub)
- Cover / social image: `docs/procureai-devpost-cover.jpg` (also used as `docs/cover.jpg`)
- Architecture image: `docs/procureai-architecture.jpg`

---

## Text description (paste into Devpost)

**ProcureAI** is a dual-track agentic procurement platform for small businesses, built for the PayPal AI Hackathon (sandbox only).

### Track 1 — Agent-to-agent marketplace
1. Owner creates an RFQ (or enriches it from **Channel3** catalog search).
2. Buyer AI negotiates with seller AIs (BATNA, multi-round counters).
3. Offers rank live in **AG Grid**; policy + signed mandate gate payment (above-threshold totals need human approval).
4. **PayPal** AUTHORIZE holds funds → seller ships → owner confirms → CAPTURE.
5. Verified webhooks keep a replay-safe order ledger (including disputes).

### Track 2 — AI procurement & payables
1. Paste supplier invoice text (or fetch a page via **KERNEL**) → LLM extract.
2. Three-way match (PO / receipt / invoice).
3. **PayPal Payouts** when MATCHED; client invoices via Agent Toolkit.
4. **Bryntum Gantt** on Overview shows live authorize → capture checkpoints from real checkouts (PayPal webhooks keep payment state honest).

### Safety
LLMs write messages; **code** decides money. Policy ALLOW / REQUIRE_APPROVAL / DENY (threshold **$20**), HMAC mandates, authorize-then-capture, idempotent PayPal calls.

### Try it
Open the hosted URL above → Overview → Channel3 **Use market price → Review** → Queue negotiation. Bryntum is on Overview. **Payables** for extract/match; **Automation** → KERNEL for invoice page fetch.

Local setup: see README **Quick start** (`pnpm install`, copy `.env.example`, sandbox PayPal + Azure AI).

---

## Tools (Devpost “built with”)

| Tool | How we use it |
|---|---|
| **PayPal** | Sandbox Orders AUTHORIZE/CAPTURE, Payouts, webhooks, Agent Toolkit (invoices, disputes, assistant) + MCP |
| **Azure AI Foundry** | Buyer / seller / extractor / assistant models |
| **AG Grid** | Live offer ranking + negotiation feed grids |
| **Render** | Hosted web + API, Postgres, Workflows package |
| **Channel3** | Catalog search → RFQ brief sellers negotiate |
| **KERNEL** | Invoice/page fetch → Payables extract |
| **Bryntum Gantt Enterprise** | Overview payment plan — live authorize/capture checkpoints |
| **Slack** (optional stretch) | Approval cards via webhook |
| Next.js, Express, Drizzle/Postgres, pnpm monorepo | App stack |

---

## Submission checklist

- [x] Project meets dual-track / PayPal requirements (sandbox)
- [x] Text description (above)
- [x] Functional demo — hosted URL **or** README Quick start
- [x] Tools list with how used
- [x] Public GitHub repo + MIT `LICENSE`
- [x] Cover + architecture images in `docs/`
- [ ] **Demo video** ≤3 min on YouTube (you record after smoke test)

### Suggested video outline (≤3:00)

1. **0:00–0:20** Hosted URL + dual-track Overview + assistant hi  
2. **0:20–1:10** Sticky RFQ → Offers → Checkout → PayPal approve → **HELD** (Funds on hold); optional ship→capture  
3. **1:10–1:40** Payments → Simulate dispute → draft (owner-gated accept)  
4. **1:40–2:30** Jump to **Payables**: extract → match → payout mention  
5. **2:30–3:00** Safety line: agents negotiate; ≤$20 auto / >$20 approval; PayPal holds until capture  


Do **not** use copyrighted music or third-party trademarks beyond fair product logos you have rights to show.
