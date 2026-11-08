# Negotiation persistence + API (v0)

Learning goal: store owner procurement requests, link them to Render workflow runs,
and expose start/status endpoints without fabricating offers or touching payments.

## Why this exists

- Browser drafts are session-only today.
- The negotiate workflow already runs in WSL, but the web app cannot start or poll it.
- We need durable records: request fields, workflow run id, lifecycle status, result/error.

## Non-goals (v0)

- No PayPal create/capture/void from these endpoints.
- No public unauthenticated mutation.
- No trusting client-supplied prices, seller ids, or approval outcomes.
- No silent auto-start from "Save draft".

## Table: `negotiations`

| Column | Type | Notes |
|---|---|---|
| id | text PK | server-generated uuid |
| owner_id | text | workspace owner; required for isolation |
| idempotency_key | text | unique per owner; prevents duplicate starts |
| status | text | DRAFT \| QUEUED \| RUNNING \| SUCCEEDED \| FAILED \| CANCELLED |
| brief | text | max 500 |
| priority | text | price \| speed \| balanced |
| quantity | integer | 1..10000 |
| max_unit_price | integer | cents |
| currency | text | USD for now |
| needed_by_days | integer | 1..365 |
| workflow_run_id | text null | Render run id when started |
| result | jsonb null | serialized negotiate result |
| error | jsonb null | structured failure |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Indexes: `(owner_id, created_at)`, unique `(owner_id, idempotency_key)`, `(status)`, `(workflow_run_id)`.

## API (v0)

### POST /api/negotiations

- Auth: owner key/header (fail closed).
- Body: brief, priority, quantity, maxUnitPrice, currency, neededByDays, idempotencyKey.
- Validate with the same limits as RFQ/protocol.
- Behavior: create QUEUED row; do not invent offers.
- Idempotent: same owner + key returns the existing row.
- Response: `{ id, status, createdAt }` (no fake savings).

### GET /api/negotiations/:id

- Auth: owner must own the row (else 404).
- Returns status, workflowRunId, result/error when present.

## Status flow

DRAFT (optional) → QUEUED → RUNNING → SUCCEEDED | FAILED  
CANCELLED only from QUEUED/RUNNING with explicit owner action (later).

## Safety checklist

- [ ] rejectUnauthorized TLS stays on for DB
- [ ] amounts derived later from stored records, never chat payloads
- [ ] sandbox-only payment tools remain separate
- [ ] empty/error states stay truthful in UI