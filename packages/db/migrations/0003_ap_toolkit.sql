-- AP automation + dispute drafts for PayPal Agent Toolkit flows
-- UP Migration

ALTER TABLE "disputes"
  ADD COLUMN IF NOT EXISTS "agent_draft" text,
  ADD COLUMN IF NOT EXISTS "agent_draft_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "accept_approved_by" text,
  ADD COLUMN IF NOT EXISTS "accept_approved_at" timestamptz;

CREATE TABLE IF NOT EXISTS "supplier_invoices" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL,
  "source" text NOT NULL,
  "vendor_name" text,
  "supplier_id" text,
  "invoice_number" text,
  "currency" text NOT NULL DEFAULT 'USD',
  "amount" integer NOT NULL,
  "due_date" text,
  "line_items" jsonb,
  "confidence" integer NOT NULL DEFAULT 0,
  "low_confidence" integer NOT NULL DEFAULT 0,
  "raw_text" text,
  "paypal_invoice_id" text,
  "status" text NOT NULL DEFAULT 'EXTRACTED',
  "match_status" text NOT NULL DEFAULT 'UNMATCHED',
  "match_notes" text,
  "order_id" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "supplier_invoices_owner_created_idx"
  ON "supplier_invoices" USING btree ("owner_id", "created_at");
CREATE INDEX IF NOT EXISTS "supplier_invoices_match_status_idx"
  ON "supplier_invoices" USING btree ("match_status");

CREATE TABLE IF NOT EXISTS "supplier_reputation" (
  "supplier_id" text PRIMARY KEY NOT NULL,
  "on_time_score" integer NOT NULL DEFAULT 500,
  "dispute_score" integer NOT NULL DEFAULT 500,
  "price_honesty_score" integer NOT NULL DEFAULT 500,
  "orders_counted" integer NOT NULL DEFAULT 0,
  "disputes_counted" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "payout_batches" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL,
  "paypal_batch_id" text,
  "status" text NOT NULL,
  "amount" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "invoice_id" text,
  "receiver" text NOT NULL,
  "note" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "payout_batches_owner_created_idx"
  ON "payout_batches" USING btree ("owner_id", "created_at");
