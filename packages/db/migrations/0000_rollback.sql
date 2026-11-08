-- Rollback for initial schema
-- DOWN Migration
-- IMPORTANT: Run this to safely rollback the initial migration
-- WARNING: This will drop all tables and data

DROP INDEX IF EXISTS "disputes_status_idx";
DROP INDEX IF EXISTS "disputes_order_id_idx";
DROP INDEX IF EXISTS "ledger_entries_order_id_idx";
DROP INDEX IF EXISTS "ledger_entries_event_id_idx";
DROP INDEX IF EXISTS "webhook_events_received_at_idx";
DROP INDEX IF EXISTS "webhook_events_event_type_idx";
DROP INDEX IF EXISTS "mandates_consumed_at_idx";
DROP INDEX IF EXISTS "mandates_expires_at_idx";
DROP INDEX IF EXISTS "mandates_rfq_id_idx";
DROP INDEX IF EXISTS "approval_audit_approval_id_idx";
DROP INDEX IF EXISTS "approvals_expires_at_idx";
DROP INDEX IF EXISTS "approvals_status_idx";
DROP INDEX IF EXISTS "approvals_rfq_id_idx";
DROP INDEX IF EXISTS "order_transitions_order_id_idx";
DROP INDEX IF EXISTS "orders_capture_id_idx";
DROP INDEX IF EXISTS "orders_authorization_id_idx";
DROP INDEX IF EXISTS "orders_paypal_order_id_idx";
DROP INDEX IF EXISTS "orders_status_idx";
DROP INDEX IF EXISTS "orders_supplier_id_idx";
DROP INDEX IF EXISTS "orders_rfq_id_idx";

DROP TABLE IF EXISTS "preferences";
DROP TABLE IF EXISTS "disputes";
DROP TABLE IF EXISTS "ledger_entries";
DROP TABLE IF EXISTS "webhook_events";
DROP TABLE IF EXISTS "mandates";
DROP TABLE IF EXISTS "approval_audit";
DROP TABLE IF EXISTS "approvals";
DROP TABLE IF EXISTS "order_transitions";
DROP TABLE IF EXISTS "orders";
DROP TABLE IF EXISTS "sellers";
