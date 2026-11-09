# ProcureAI — demo & test scenarios

**Demo:** https://agentic-procurement-web.onrender.com  
**API:** https://agentic-procurement-api.onrender.com/health  

Free Render may cold-start 30–60s — wait and refresh once. Hard-refresh (`Ctrl+Shift+R`) before recording.

**Policy:** order total ≤ **$20** auto-allow; above **$20** → REQUIRE_APPROVAL before Pay.

---

## Demo video path (≈3 min)

1. **Overview** — dual-track + Buying assistant `Say hi`
2. Channel3 search → **Use market price → Review** → **Queue negotiation** (or Seed demo chairs)
3. **Supplier offers** — AG Grid ranks; open a **new** SUCCEEDED row (not old snapshots)
4. **Checkout** → PayPal sandbox approve → **Authorize hold** → ship → capture
5. **Payables** — Extract sample → Match
6. **Overview** Bryntum Gantt — live checkpoints; hover status dots
7. **Automation** — KERNEL fetch only (opens Payables)

---

## Buying assistant

| # | Steps | Expected |
|---|---|---|
| A1 | Overview → Buying assistant → `Say hi` → Send | **Thinking…** then **Ready**; short reply |
| A2 | Ask `How does authorize then capture work?` | Hold → ship → owner confirm → capture; does **not** capture alone |
| A3 | Ask for a ~$45 sandbox client invoice | May call Toolkit create/send; concise next step |

---

## Scenario pack

### S1 — Marketplace negotiate

| Case | Steps | Pass if |
|---|---|---|
| S1.1 | Overview → Channel3 **Use market price → Review** *or* Seed / type brief → **Queue** | Status → SUCCEEDED |
| S1.2 | **Supplier offers** on that new row | Ranked offers + SSE chat |
| S1.3 | Sticky-note / low budget RFQ | Sellers scale near ceiling; eligible winner possible |

### S2 — PayPal authorize → capture

| Case | Steps | Pass if |
|---|---|---|
| S2.1 | **Checkout winning offer** | Order / PayPal buttons or approve URL |
| S2.2 | Sandbox buyer approves | Status ready for hold |
| S2.3 | **Authorize hold** | **HELD** (not captured) |
| S2.4 | Mark shipped → **Confirm delivery & capture** | **CAPTURED**; Payments inbox updates |

### S3 — Human approval (>$20)

| Case | Steps | Pass if |
|---|---|---|
| S3.1 | Checkout chair (or any total > $20) | REQUIRE_APPROVAL before pay |
| S3.2 | Owner approve | Pay / checkout can proceed |

### S4 — Payables

| Case | Steps | Pass if |
|---|---|---|
| S4.1 | **Payables** → Extract (sample prefilled) | Vendor / amount extracted |
| S4.2 | Match PO/receipt = invoice | **MATCHED** |
| S4.3 | Optional Payout / client invoice | Sandbox success or clear error |

### S5 — KERNEL

| Case | Steps | Pass if |
|---|---|---|
| S5.1 | **Automation** → public URL → Fetch | Opens Payables with page text |
| S5.2 | Extract | Fields or clear parse error |

### S6 — Bryntum (Overview only)

| Case | Steps | Pass if |
|---|---|---|
| S6.1 | **Overview** after checkout activity | Gantt shows live authorize/capture checkpoints |
| S6.2 | Hover a status dot | Tooltip with payment status |

### S7 — Safety

| Case | Steps | Pass if |
|---|---|---|
| S7.1 | Capture before PayPal approve | Error; no capture |
| S7.2 | API `/health` | `ok` + `paypalEnv: sandbox` |
