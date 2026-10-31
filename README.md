# Agentic Procurement

An AI purchasing department for small businesses, built for the [PayPal AI Hackathon 2026](https://paypalaihackathon.devpost.com).

Tell it *"We need 200 shipping boxes and 50 hoodies by Friday, budget $2,000."* A **buyer agent** negotiates in parallel with competing **seller agents**, recommends the best deal, and pays with **PayPal authorize-then-capture**, so funds are held and only captured when delivery is confirmed (or voided automatically if the seller fails). Spend limits, approval tiers and signed mandates are enforced in code. Every action goes into a hash-chained audit log, and an eval harness measures savings against list price.

It also automates payables: invoice extraction, three-way match, PayPal Payouts and client invoicing, all shown on a live AG Grid dashboard.

## Stack
Next.js · AG Grid · Node/TypeScript · PayPal Agent Toolkit + Orders/Payments/Invoicing/Payouts/Disputes/Webhooks APIs (sandbox) · Azure AI Foundry gateway · Postgres · Render

## Docs
- [Architecture & plan](docs/ARCHITECTURE.md)
- [Setup](SETUP.md)

## License
MIT
