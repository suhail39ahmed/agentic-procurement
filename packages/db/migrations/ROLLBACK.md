# Down migration

`0000_rollback.sql` drops:

sellers, orders, order_transitions, approvals, approval_audit, mandates, webhook_events, ledger_entries, disputes, preferences

**All data in those tables is lost.** Foreign keys are dropped with the tables.

Use only on a disposable database. Do not run this against Render or any environment with real orders.

Re-apply after a disposable reset:

```
pnpm --filter db migrate
pnpm --filter db seed
```
