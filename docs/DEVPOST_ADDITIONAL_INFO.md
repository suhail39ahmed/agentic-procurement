# Devpost — Additional info (copy/paste)

For judges and organizers (not on the public page).  
**Upload file:** upload `docs/JUDGE_TEST_GUIDE.md` (or zip it with `docs/procureai-architecture.jpg`). Limit 35 MB.

---

## Form answers

### Upload a File
Upload: **`JUDGE_TEST_GUIDE.md`** from this folder (or a zip containing that file + architecture image).

### Submitter Type
```
Individual
```

### Submitter Country of Residence
```
Singapore
```

### Canada province
```
N/A
```

### Organization Name
```
N/A
```

### Is your project new, or did it exist before Oct 1, 2026 (9:15 am PT)?
```
New
```

### If it existed before…
```
N/A
```

---

### Explain how your project meets the main technology requirement

```
ProcureAI integrates PayPal sandbox end-to-end and Azure AI for agent language — money never moves because an LLM “decided” to pay.

PayPal developer platform (sandbox):
• Orders API with intent=AUTHORIZE — create checkout after a winning offer; buyer approves on PayPal.
• Authorization hold — funds held until delivery is confirmed.
• Captures — owner-gated capture after ship/confirm.
• Webhooks (verified) — project CAPTURE/AUTHORIZE/refund/dispute events into a replay-safe order ledger; also drive the Bryntum rescheduler agent.
• Payouts REST — supplier payout after three-way match on the payables track.
• PayPal Agent Toolkit (+ MCP) — assistant tools for sandbox invoices (create/send), disputes list/get, owner-gated accept_dispute_claim, order lookup.

AI tools / models:
• Azure AI Foundry — buyer agent and seller agents (negotiation dialogue, BATNA/counters); invoice extractor (AP track); buying assistant with Agent Toolkit tool-calling.
• Deterministic TypeScript (not the model) owns scoring, policy ALLOW/REQUIRE_APPROVAL/DENY, HMAC payment mandates, and order state transitions.

Demo guard DEMO_MAX_USD=2 keeps every path sandbox-safe for judges.
```

---

### Which additional sponsor tool(s) did you use?

**Select these:**
- [x] AG Grid
- [x] Bryntum
- [x] Channel3
- [x] KERNEL
- [x] Render

**Do not select:** APIMatic, Astropods, Elastic, Postman, Zapier, None

---

### Public code repository URL
```
https://github.com/suhail39ahmed/agentic-procurement
```

### Working demo URL
```
https://agentic-procurement-web.onrender.com
```

---

### Testing instructions or credentials the judges need

```
No login required for the hosted demo. Sandbox only; DEMO_MAX_USD=2.

Quick path (≈2 min):
1) https://agentic-procurement-web.onrender.com (cold start may take ~30–60s on free Render).
2) Overview → Channel3 “Use for RFQ” (or type a ≤$2 brief) → Review → Queue negotiation.
3) Supplier offers → AG Grid ranks; optional Checkout → PayPal sandbox approve → Authorize hold.
4) Payables → Extract sample invoice → Match (~$1.50) → optional Payout.
5) Automation → Bryntum → “Simulate late capture” / refund / dispute → Reset plan.

Full checklist: see uploaded JUDGE_TEST_GUIDE.md (also in repo at docs/JUDGE_TEST_GUIDE.md).
API health: https://agentic-procurement-api.onrender.com/health
Judges do not need our private API keys. For optional PayPal approve, use any PayPal sandbox personal account.
```

---

### How would you rate your overall experience integrating PayPal? (1–10)
Suggested:
```
9
```

### Overall experience rating — why / feedback

```
Sandbox Orders AUTHORIZE→CAPTURE, webhooks, and the Agent Toolkit (invoices/disputes + MCP) fit agentic procurement well: agents negotiate while PayPal remains the system of record for money. Clear sandbox/live separation and idempotent Request-Ids helped. Wish list: more first-party examples for authorize-hold UX and payout + webhook pairing in one sample app. Overall excellent for a dual-track marketplace + payables demo.
```

### Open to contact for additional PayPal feedback?
```
Yes
```
(or Yes / No per the dropdown)

---

### If you used the APIMatic Context Plugin…
```
N/A — we did not use APIMatic.
```

### If you used AG Grid, what was your experience…

```
AG Grid Community was excellent for live procurement tables. We use it for supplier offer ranking and the negotiation activity feed with applyTransaction updates driven by SSE — judges can see offers update without a full page reload. Sorting/filtering made comparing price vs speed winners clear. We did not need AG Charts/AG Studio for this demo; the grid alone carried the marketplace track UI.
```

---

### Eligibility checkboxes
Check all that apply / that you can honestly affirm:
- [x] I (and teammates, if any) are at least the age of majority where I reside
- [x] Eligible jurisdiction to compete
- [x] Not employees/representatives/agents of the Promotion Entities

---

### Which AI tools have you leveraged while working on this project?

```
Azure AI Foundry (buyer/seller/extractor/assistant models); PayPal Agent Toolkit (OpenAI-compatible tool-calling); Cursor (AI-assisted coding); GitHub Copilot was not required for the submission.
```

### Describe the level of learning you/your team derived from the project
Suggested dropdown pick (adjust to options shown):
```
High / Significant learning
```
If free text is allowed:
```
High — learned to separate LLM conversation from deterministic payment control, PayPal authorize-hold lifecycle, webhook ledger design, and dual-track marketplace + AP product thinking.
```

### Did you gain AI value that you can use in your career?
```
Yes
```

---

## Sponsor usage one-liners (if a follow-up asks)

| Tool | Role |
|---|---|
| **AG Grid** | Live offer ranking + feed grids |
| **Bryntum** | Gantt; agent reschedules on PayPal payment signals |
| **Channel3** | Catalog search → RFQ sellers negotiate |
| **KERNEL** | Page fetch → invoice extract |
| **Render** | Hosted web + API + Postgres |
