# PostgreSQL persistence

Orders, approvals, mandates, webhook events, ledger, disputes, preferences, and sellers persist in Postgres. Domain money stays in dollars. The database stores integer cents (`$2.50` → `250`). Conversion happens only in `packages/db`.

`DATABASE_URL` is read from the repo-root `.env` (already used for PayPal). Do not overwrite that file with `.env.example`.

## Commands (PowerShell 5)

Run from the repo root. Each line is separate (no `&&`).

```powershell
pnpm install
pnpm --filter db migrate
pnpm --filter db seed
pnpm --filter db seed
pnpm --filter db test
pnpm --filter agents test:persistence
pnpm --filter api start
```

`migrate` and `seed` load root `.env` and do not print the connection string.

Seed is idempotent. Expected sellers: seller-a Anchor Office Supply, seller-b BundleWorks, seller-c ValueSeat Direct, seller-d Express Ergonomics.

## Safe verification (non-destructive)

```powershell
pnpm --filter db exec tsx -e "import { loadRootEnv } from './src/env.ts'; loadRootEnv(); import postgres from 'postgres'; const sql = postgres(process.env.DATABASE_URL, { max: 1 }); const rows = await sql`select id, name, floor_price from sellers order by id`; console.log(rows.map(r => r.id + ' ' + r.name + ' ' + r.floor_price).join('\n')); await sql.end();"
```

`floor_price` is cents (`15000` = `$150`).

## Down migration

`packages/db/migrations/0000_rollback.sql` **drops every persistence table and deletes all rows**. It is for disposable databases only. Do not run it against the Render database.

## Runtime

With `DATABASE_URL` set, API webhooks and agent mandate/approval/ledger/preference calls share Postgres (including replay protection). Without it, those modules keep process-local maps so demos still run.

## Breaking async changes

These are now `async` (call with `await`):

- `saveOrder`, `getOrder`, `listOrders`, `applyWebhookEvent`, `listLedger`, `listDisputes`, `listEvents`
- `issueMandate`, `verifyMandate`
- `requestApproval`, `decide`, `getApproval`, `listApprovals`

`verifyMandate(token, expected)` is unchanged except it returns a Promise. Policy `$2` / `$10` thresholds are still dollars.
