# Setup

1. Create a PayPal developer account, then a **sandbox REST app** at https://developer.paypal.com/dashboard/applications/sandbox. Enable Payouts and Invoicing in the app features.
2. Create sandbox accounts: 1 business buyer (the owner), 4 merchant accounts (sellers A–D), 1 personal account (client).
3. Copy `.env.example` to `.env` and fill it in. **Never commit `.env`.**
4. Register a webhook pointing to `https://<render-app>/api/webhooks/paypal` for the events listed in docs/ARCHITECTURE.md §6, then set `PAYPAL_WEBHOOK_ID`.
5. Configure your Azure AI Foundry gateway endpoint and model names.
6. `pnpm i && pnpm db:migrate && pnpm dev`
7. Deploy: `render.yaml` blueprint (web + api + Postgres).

Optional: an AG Grid Enterprise trial key (https://www.ag-grid.com/license-pricing/) removes the watermark from Enterprise features.
