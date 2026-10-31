# Agentic Procurement

AI agents that negotiate, buy and pay on PayPal: an agentic procurement and payables platform for small businesses. Built for the [PayPal AI Hackathon 2026](https://paypalaihackathon.devpost.com).

Tell it *"We need 200 shipping boxes and 50 hoodies by Friday, budget $2,000."* A **buyer agent** negotiates with competing **seller agents**, recommends the best deal and pays with **PayPal authorize-then-capture**. Funds are held, then captured only when delivery is confirmed, or voided if the seller fails.

## Repo layout (matches docs/ARCHITECTURE.md §9)
```
apps/web          Next.js chat, approval cards, AG Grid dashboard
apps/api          Node/TS orchestrator, SSE, PayPal webhooks
packages/paypal   PayPal REST client (OAuth, PayPal-Request-Id, authorize/capture/void) + spike script
packages/agents   buyer/seller agents, negotiation protocol, policy engine
packages/db       Postgres schema + migrations
evals/            scenario runner + LLM judge
docs/             ARCHITECTURE.md
```
Note: the scaffolding brief suggested `packages/shared` / `packages/paypal-client`. This repo follows ARCHITECTURE.md's `packages/paypal` instead, with shared PayPal types in `packages/paypal/src/types.ts`.

## Run locally
```bash
corepack enable          # gets pnpm
pnpm install
cp .env.example .env     # fill in sandbox values; never commit .env
pnpm dev                 # web on :3000, api on :4000 (/health)
pnpm spike:paypal        # first authorize -> capture test (see LESSON1.md)
```

## Docs
- [Architecture & plan](docs/ARCHITECTURE.md)
- [Setup](SETUP.md)
- [Lesson 1: scaffold + PayPal sandbox](LESSON1.md)

## License
MIT
