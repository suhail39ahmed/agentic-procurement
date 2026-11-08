-- Initial schema for agentic-procurement
-- UP Migration

CREATE TABLE IF NOT EXISTS "sellers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"floor_price" integer NOT NULL,
	"list_price" integer NOT NULL,
	"stock" integer NOT NULL,
	"lead_time_days" integer NOT NULL,
	"persona" text NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"rfq_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"paypal_order_id" text,
	"authorization_id" text,
	"capture_id" text,
	"tracking" jsonb,
	"held_at" timestamptz,
	"deliver_by" timestamptz,
	"reauthorized_at" timestamptz,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "order_transitions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"order_id" text NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"event" text NOT NULL,
	"actor" text NOT NULL,
	"at" timestamptz NOT NULL,
	"note" text
);

CREATE TABLE IF NOT EXISTS "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"rfq_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"unit_price" integer NOT NULL,
	"order_total" integer NOT NULL,
	"reasons" jsonb NOT NULL,
	"status" text NOT NULL,
	"decided_by" text,
	"created_at" timestamptz NOT NULL,
	"expires_at" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS "approval_audit" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"approval_id" text NOT NULL,
	"at" timestamptz NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"note" text
);

CREATE TABLE IF NOT EXISTS "mandates" (
	"jti" text PRIMARY KEY NOT NULL,
	"rfq_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"approved_by" text NOT NULL,
	"issued_at" timestamptz NOT NULL,
	"expires_at" timestamptz NOT NULL,
	"consumed_at" timestamptz,
	"order_id" text
);

CREATE TABLE IF NOT EXISTS "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"create_time" timestamptz NOT NULL,
	"raw" jsonb NOT NULL,
	"received_at" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS "ledger_entries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"outcome" text NOT NULL,
	"order_id" text,
	"from_status" text,
	"to_status" text,
	"reason" text NOT NULL,
	"at" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS "disputes" (
	"dispute_id" text PRIMARY KEY NOT NULL,
	"order_id" text,
	"capture_id" text,
	"reason" text NOT NULL,
	"amount" integer,
	"status" text NOT NULL,
	"opened_at" timestamptz NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "preferences" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"price_weight" integer NOT NULL,
	"speed_weight" integer NOT NULL,
	"decisions" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_supplier_id_sellers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "order_transitions" ADD CONSTRAINT "order_transitions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "approvals" ADD CONSTRAINT "approvals_supplier_id_sellers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "approval_audit" ADD CONSTRAINT "approval_audit_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "mandates" ADD CONSTRAINT "mandates_supplier_id_sellers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "mandates" ADD CONSTRAINT "mandates_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_event_id_webhook_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."webhook_events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "disputes" ADD CONSTRAINT "disputes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "orders_rfq_id_idx" ON "orders" USING btree ("rfq_id");
CREATE INDEX IF NOT EXISTS "orders_supplier_id_idx" ON "orders" USING btree ("supplier_id");
CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "orders" USING btree ("status");
CREATE INDEX IF NOT EXISTS "orders_paypal_order_id_idx" ON "orders" USING btree ("paypal_order_id");
CREATE INDEX IF NOT EXISTS "orders_authorization_id_idx" ON "orders" USING btree ("authorization_id");
CREATE INDEX IF NOT EXISTS "orders_capture_id_idx" ON "orders" USING btree ("capture_id");
CREATE INDEX IF NOT EXISTS "order_transitions_order_id_idx" ON "order_transitions" USING btree ("order_id");
CREATE INDEX IF NOT EXISTS "approvals_rfq_id_idx" ON "approvals" USING btree ("rfq_id");
CREATE INDEX IF NOT EXISTS "approvals_status_idx" ON "approvals" USING btree ("status");
CREATE INDEX IF NOT EXISTS "approvals_expires_at_idx" ON "approvals" USING btree ("expires_at");
CREATE INDEX IF NOT EXISTS "approval_audit_approval_id_idx" ON "approval_audit" USING btree ("approval_id");
CREATE INDEX IF NOT EXISTS "mandates_rfq_id_idx" ON "mandates" USING btree ("rfq_id");
CREATE INDEX IF NOT EXISTS "mandates_expires_at_idx" ON "mandates" USING btree ("expires_at");
CREATE INDEX IF NOT EXISTS "mandates_consumed_at_idx" ON "mandates" USING btree ("consumed_at");
CREATE INDEX IF NOT EXISTS "webhook_events_event_type_idx" ON "webhook_events" USING btree ("event_type");
CREATE INDEX IF NOT EXISTS "webhook_events_received_at_idx" ON "webhook_events" USING btree ("received_at");
CREATE INDEX IF NOT EXISTS "ledger_entries_event_id_idx" ON "ledger_entries" USING btree ("event_id");
CREATE INDEX IF NOT EXISTS "ledger_entries_order_id_idx" ON "ledger_entries" USING btree ("order_id");
CREATE INDEX IF NOT EXISTS "disputes_order_id_idx" ON "disputes" USING btree ("order_id");
CREATE INDEX IF NOT EXISTS "disputes_status_idx" ON "disputes" USING btree ("status");
