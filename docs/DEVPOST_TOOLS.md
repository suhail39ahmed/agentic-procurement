# Devpost — tools used (draft for #47)

Paste into Devpost “APIs, libraries, and frameworks”:

- **PayPal** — Sandbox Orders (AUTHORIZE), Captures, Payouts, Webhooks, Agent Toolkit + MCP
- **AG Grid** — Community grids with live `applyTransaction` + SSE negotiation feed
- **Render** — Web + API services, Postgres, Workflows package (`packages/workflows`)
- **Channel3** — Product catalog enrich for RFQ prefill (env-gated `CHANNEL3_API_KEY`)
- **Bryntum** — Schedule/timeline UI for delivery, replenishment, and payout dues
- **KERNEL** — Browser/agent page fetch bridge for supplier invoice HTML → extract
- **APIMatic** — OpenAPI source at `docs/openapi.yaml` for SDK/docs/MCP generation
- **Astropods** — Agent registry panel (scopes, human gates, DEMO_MAX_USD spend caps)
- **Slack** — Approval cards via `SLACK_WEBHOOK_URL` (stretch)
- Azure AI Foundry — buyer/seller/extractor/assistant models
- Next.js, Express, Drizzle/Postgres, pnpm monorepo

## Slack webhook (do not commit)

1. Local: add `SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...` to root `.env`
2. Render API service: Dashboard → Environment → `SLACK_WEBHOOK_URL` → save → redeploy
3. Automation → Request approval → card posts to Slack; Approve/Deny persists in app
