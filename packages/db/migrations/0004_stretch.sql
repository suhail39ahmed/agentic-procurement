-- Stretch features: replenishment, slack approvals, spend snapshots
-- UP Migration

CREATE TABLE IF NOT EXISTS "replenishment_rules" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL,
  "sku" text NOT NULL,
  "label" text NOT NULL,
  "threshold_qty" integer NOT NULL,
  "reorder_qty" integer NOT NULL,
  "max_unit_price" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "needed_by_days" integer NOT NULL DEFAULT 30,
  "priority" text NOT NULL DEFAULT 'balanced',
  "enabled" integer NOT NULL DEFAULT 1,
  "last_triggered_at" timestamptz,
  "last_negotiation_id" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "replenishment_rules_owner_idx"
  ON "replenishment_rules" USING btree ("owner_id");

CREATE TABLE IF NOT EXISTS "slack_approvals" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL,
  "negotiation_id" text,
  "order_total" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "supplier_id" text,
  "status" text NOT NULL DEFAULT 'PENDING',
  "slack_ts" text,
  "slack_channel" text,
  "decided_by" text,
  "decided_at" timestamptz,
  "payload" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "slack_approvals_owner_status_idx"
  ON "slack_approvals" USING btree ("owner_id", "status");
