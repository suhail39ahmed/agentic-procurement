-- Negotiations: durable owner requests + workflow run linkage
-- UP Migration

CREATE TABLE IF NOT EXISTS "negotiations" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "status" text NOT NULL,
  "brief" text NOT NULL,
  "priority" text NOT NULL,
  "quantity" integer NOT NULL,
  "max_unit_price" integer NOT NULL,
  "currency" text NOT NULL,
  "needed_by_days" integer NOT NULL,
  "workflow_run_id" text,
  "result" jsonb,
  "error" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "negotiations_status_check" CHECK ("status" IN ('DRAFT', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  CONSTRAINT "negotiations_priority_check" CHECK ("priority" IN ('price', 'speed', 'balanced')),
  CONSTRAINT "negotiations_quantity_check" CHECK ("quantity" >= 1 AND "quantity" <= 10000),
  CONSTRAINT "negotiations_max_unit_price_check" CHECK ("max_unit_price" > 0),
  CONSTRAINT "negotiations_currency_check" CHECK ("currency" = 'USD'),
  CONSTRAINT "negotiations_needed_by_days_check" CHECK ("needed_by_days" >= 1 AND "needed_by_days" <= 365),
  CONSTRAINT "negotiations_brief_len_check" CHECK (char_length("brief") >= 1 AND char_length("brief") <= 500)
);

CREATE INDEX IF NOT EXISTS "negotiations_owner_created_idx"
  ON "negotiations" USING btree ("owner_id", "created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "negotiations_owner_idempotency_idx"
  ON "negotiations" USING btree ("owner_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "negotiations_status_idx"
  ON "negotiations" USING btree ("status");

CREATE INDEX IF NOT EXISTS "negotiations_workflow_run_id_idx"
  ON "negotiations" USING btree ("workflow_run_id");