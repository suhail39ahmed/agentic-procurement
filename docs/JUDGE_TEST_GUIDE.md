# ProcureAI — Judge test guide

**Hosted demo:** https://agentic-procurement-web.onrender.com  
**API health:** https://agentic-procurement-api.onrender.com/health  
**Source:** https://github.com/suhail39ahmed/agentic-procurement (MIT)

Sandbox only. Demo spend guard: **`DEMO_MAX_USD=2`**. Prefer qty **1** and max unit ≤ **$2**.

Free Render services may cold-start (~30–60s). If the first click is slow, wait and retry once.

---

## 60-second smoke (minimum)

1. Open the hosted web URL.
2. **Overview** → Channel3 **Use for RFQ** (or type a ≤$2 brief) → **Review draft** → **Queue negotiation**.
3. Wait for status **SUCCEEDED** → **Supplier offers** → inspect AG Grid ranks.
4. (Optional money path) **Checkout winning offer** → complete PayPal sandbox approve → **Authorize hold**.
5. **Payables** → keep sample invoice text → **Extract** → **Match** with PO/receipt ≈ $1.50.
6. **Automation** → Bryntum Gantt → **Simulate late capture** (bars should move/flag) → **Reset plan**.

---

## Track A — Marketplace (PayPal + AI)

| Step | Where | What to expect |
|---|---|---|
| A1 | Overview | Dual-track cards: Marketplace + Payables |
| A2 | Channel3 **Use for RFQ** | Brief fills with a real catalog product ≤ $2 (needs `CHANNEL3_API_KEY` on API) |
| A3 | Queue negotiation | Buyer/seller agents run; SSE stream shows messages |
| A4 | Supplier offers | AG Grid ranks offers; eligible winner highlighted |
| A5 | Checkout | PayPal AUTHORIZE order created; approve as sandbox buyer |
| A6 | Payments | Authorize hold → (optional) ship → owner capture |

**PayPal tools used here:** Orders API (`intent=AUTHORIZE`), Captures, Checkout approve URL, verified webhooks → order ledger.  
**AI used here:** Azure AI buyer + seller agents (negotiation language); scoring/policy/mandates are **code**, not the LLM.

---

## Track B — Payables (PayPal + AI)

| Step | Where | What to expect |
|---|---|---|
| B1 | Payables | Sample invoice text already loaded |
| B2 | Extract | LLM extracts vendor / amount / due (≤ $2) |
| B3 | Match | PO + receipt ≈ invoice → MATCHED |
| B4 | Payout | PayPal Payouts batch when MATCHED (sandbox) |
| B5 | Client invoice | Agent Toolkit create/send invoice (optional) |
| B6 | Automation → KERNEL | Paste a public page URL → opens Payables with fetched text |

**PayPal tools used here:** Payouts REST, Invoicing via **PayPal Agent Toolkit**, dispute list/draft/accept (owner-gated).  
**AI used here:** Azure AI extractor + buying assistant (toolkit tools).

---

## Track C — Bryntum agent rescheduler

| Step | Where | What to expect |
|---|---|---|
| C1 | Automation | Bryntum **Gantt Enterprise** chart loads |
| C2 | Simulate late capture / fail / refund / dispute | Milestones move or flag (late/failed/refunded/disputed) |
| C3 | Reset plan | Baseline authorize → delivery → capture → payout restored |

Live PayPal webhooks (`PAYMENT.CAPTURE.*`, refunds, disputes) call the same agent path as the simulate buttons.

---

## Credentials / secrets

Judges do **not** need private API keys for the hosted demo.

- No login wall on the public dashboard for the hackathon demo surfaces.
- PayPal sandbox buyer approve (only if you run the full checkout): use your own PayPal sandbox personal account, or skip A5–A6 and still validate negotiation + payables + Bryntum.
- Do **not** ask the submitter for production PayPal live credentials — app refuses non-sandbox.

---

## Local run (if hosted is cold)

See README **Quick start**:

```bash
pnpm install
cp .env.example .env   # sandbox PayPal + Azure AI + OWNER_* keys
pnpm --filter api dev
pnpm --filter web dev
```

---

## How this meets the main tech requirement

| Required | What we used | Role in the project |
|---|---|---|
| PayPal developer platform (sandbox) | Orders AUTHORIZE/CAPTURE, Checkout, Webhooks, Payouts, Agent Toolkit (invoices/disputes/assistant) + MCP | All money movement and payment-state truth |
| AI tool / model | Azure AI Foundry (buyer, seller, extractor, assistant deployments) | Negotiation copy, invoice extract, assistant tool-calling |

**Sponsor tools (optional):** AG Grid, Bryntum, Channel3, KERNEL, Render.  
**Not used:** APIMatic, Astropods, Postman, Elastic, Zapier.
