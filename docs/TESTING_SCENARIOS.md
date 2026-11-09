# ProcureAI — testing scenarios & cases

**Demo:** https://agentic-procurement-web.onrender.com  
**API:** https://agentic-procurement-api.onrender.com/health  

Free Render may cold-start 30–60s — wait and refresh once.

---

## Buying assistant

Hosted probe returns a real reply when Azure + PayPal Toolkit are configured on the **API**.

| # | Steps | Expected |
|---|---|---|
| A1 | Overview → Buying assistant → type `Say hi` → Send | Badge **Thinking…** then **Ready**; assistant reply appears |
| A2 | Ask `How does authorize then capture work?` | Explains hold → ship → owner confirm → capture; does **not** claim it can capture alone |
| A3 | Ask `Create a $45 sandbox invoice for client-agentic@personal.example.com` | May call PayPal Toolkit create/send invoice; concise next step |
| A4 | Stop API / break Azure key (local only) | Error text + badge **Not connected** |

If A1 fails on hosted: confirm Render **API** has `AZURE_AI_ENDPOINT`, `AZURE_AI_API_KEY`, `AZURE_AI_DEPLOYMENT_STRONG`, `AZURE_AI_DEPLOYMENT_FAST`, plus PayPal sandbox keys. Web needs `API_BASE_URL` + `OWNER_API_KEY`.

---

## Scenario pack (run in order)

### S1 — Marketplace negotiate (no PayPal money yet)

| Case | Steps | Pass if |
|---|---|---|
| S1.1 | Overview → Channel3 **Use for RFQ** *or* type a brief (e.g. chairs) → Review → **Queue negotiation** | Negotiation appears; status moves toward SUCCEEDED |
| S1.2 | Open **Supplier offers** | AG Grid shows ranked offers; SSE chat has buyer/seller lines |
| S1.3 | Pick succeeded negotiation in the selector | Brief/budget match what you queued |

### S2 — PayPal authorize hold (optional money path)

| Case | Steps | Pass if |
|---|---|---|
| S2.1 | From offers → **Checkout winning offer** | Approve URL / order created |
| S2.2 | Open approve link as **PayPal sandbox personal** buyer → Pay Now | Return to app; notice about buyer approved |
| S2.3 | **Authorize hold** | Order status **HELD** (not captured) |
| S2.4 | Mark shipped → **Confirm delivery / capture** | Status **CAPTURED** |

### S3 — Human approval (>$20)

| Case | Steps | Pass if |
|---|---|---|
| S3.1 | Checkout RFQ whose order total exceeds **$20** (qty × unit) | Policy **REQUIRE_APPROVAL** — owner gate before pay |
| S3.2 | Approve as owner (UI/API approval path) | Only then mandate / checkout can proceed |

### S4 — Payables

| Case | Steps | Pass if |
|---|---|---|
| S4.1 | **Payables** → Extract (sample text prefilled) | Invoice stored with amount/vendor |
| S4.2 | Match with PO/receipt = invoice amount | **MATCHED** |
| S4.3 | Payout (sandbox seller email) | Payout batch submitted *or* clear sandbox error |
| S4.4 | Client invoice ~$45 | Toolkit create/send succeeds |

### S5 — KERNEL → extract

| Case | Steps | Pass if |
|---|---|---|
| S5.1 | Automation → paste a **public** URL → Fetch | Opens Payables with page text |
| S5.2 | Extract | Fields extracted or clear parse error |

### S6 — Bryntum payment rescheduler

| Case | Steps | Pass if |
|---|---|---|
| S6.1 | Automation → Gantt visible | Milestones: authorize / delivery / capture / payout |
| S6.2 | **Simulate late capture** | Capture/payout move or flag **late** |
| S6.3 | **Simulate refund** / **dispute** | Flags update; agent log shows action |
| S6.4 | **Reset plan** | Baseline restored |

### S7 — Safety smoke

| Case | Steps | Pass if |
|---|---|---|
| S7.1 | Try capture before PayPal approve | Clear error; no capture |
| S7.2 | API `/health` | `{"status":"ok","paypalEnv":"sandbox"}` |

---

## Suggested 10-minute recording order

1. Overview + assistant **Say hi** (A1)  
2. Channel3 → Queue → offers (S1)  
3. Checkout → sandbox approve → Authorize (S2.1–S2.3)  
4. Payables extract + match (S4.1–S4.2)  
5. Bryntum simulate late capture (S6.2)  
