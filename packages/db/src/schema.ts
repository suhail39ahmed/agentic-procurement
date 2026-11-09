import { pgTable, text, integer, timestamp, jsonb, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";

export const auditRecords = pgTable("audit_records", {
  orderId: text("order_id").notNull().references(() => orders.id),
  sequence: integer("sequence").notNull(),
  event: text("event").notNull(),
  actor: text("actor").notNull(),
  at: text("at").notNull(),
  from: text("from_status"),
  to: text("to_status"),
  note: text("note"),
  previousHash: text("previous_hash").notNull(),
  hash: text("hash").notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.orderId, table.sequence] }),
}));

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

export const sellers = pgTable("sellers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  floorPrice: integer("floor_price").notNull(),
  listPrice: integer("list_price").notNull(),
  stock: integer("stock").notNull(),
  leadTimeDays: integer("lead_time_days").notNull(),
  persona: text("persona").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  rfqId: text("rfq_id").notNull(),
  supplierId: text("supplier_id").notNull().references(() => sellers.id),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull(),
  paypalOrderId: text("paypal_order_id"),
  authorizationId: text("authorization_id"),
  captureId: text("capture_id"),
  tracking: jsonb("tracking").$type<{ carrier: string; number: string }>(),
  heldAt: ts("held_at"),
  deliverBy: ts("deliver_by"),
  reauthorizedAt: ts("reauthorized_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (table) => ({
  rfqIdIdx: index("orders_rfq_id_idx").on(table.rfqId),
  supplierIdIdx: index("orders_supplier_id_idx").on(table.supplierId),
  statusIdx: index("orders_status_idx").on(table.status),
  paypalOrderIdIdx: index("orders_paypal_order_id_idx").on(table.paypalOrderId),
  authorizationIdIdx: index("orders_authorization_id_idx").on(table.authorizationId),
  captureIdIdx: index("orders_capture_id_idx").on(table.captureId),
}));

export const orderTransitions = pgTable("order_transitions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  orderId: text("order_id").notNull().references(() => orders.id),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  event: text("event").notNull(),
  actor: text("actor").notNull(),
  at: ts("at").notNull(),
  note: text("note"),
}, (table) => ({
  orderIdIdx: index("order_transitions_order_id_idx").on(table.orderId),
}));

export const approvals = pgTable("approvals", {
  id: text("id").primaryKey(),
  rfqId: text("rfq_id").notNull(),
  supplierId: text("supplier_id").notNull().references(() => sellers.id),
  unitPrice: integer("unit_price").notNull(),
  orderTotal: integer("order_total").notNull(),
  reasons: jsonb("reasons").$type<string[]>().notNull(),
  status: text("status").notNull(),
  decidedBy: text("decided_by"),
  createdAt: ts("created_at").notNull(),
  expiresAt: ts("expires_at").notNull(),
}, (table) => ({
  rfqIdIdx: index("approvals_rfq_id_idx").on(table.rfqId),
  statusIdx: index("approvals_status_idx").on(table.status),
  expiresAtIdx: index("approvals_expires_at_idx").on(table.expiresAt),
}));

export const approvalAudit = pgTable("approval_audit", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  approvalId: text("approval_id").notNull().references(() => approvals.id),
  at: ts("at").notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  note: text("note"),
}, (table) => ({
  approvalIdIdx: index("approval_audit_approval_id_idx").on(table.approvalId),
}));

export const mandates = pgTable("mandates", {
  jti: text("jti").primaryKey(),
  rfqId: text("rfq_id").notNull(),
  supplierId: text("supplier_id").notNull().references(() => sellers.id),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  approvedBy: text("approved_by").notNull(),
  issuedAt: ts("issued_at").notNull(),
  expiresAt: ts("expires_at").notNull(),
  consumedAt: ts("consumed_at"),
  orderId: text("order_id").references(() => orders.id),
}, (table) => ({
  rfqIdIdx: index("mandates_rfq_id_idx").on(table.rfqId),
  expiresAtIdx: index("mandates_expires_at_idx").on(table.expiresAt),
  consumedAtIdx: index("mandates_consumed_at_idx").on(table.consumedAt),
}));

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  createTime: ts("create_time").notNull(),
  raw: jsonb("raw").notNull(),
  receivedAt: ts("received_at").notNull(),
}, (table) => ({
  eventTypeIdx: index("webhook_events_event_type_idx").on(table.eventType),
  receivedAtIdx: index("webhook_events_received_at_idx").on(table.receivedAt),
}));

export const ledgerEntries = pgTable("ledger_entries", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  eventId: text("event_id").notNull().references(() => webhookEvents.id),
  eventType: text("event_type").notNull(),
  outcome: text("outcome").notNull(),
  orderId: text("order_id").references(() => orders.id),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  reason: text("reason").notNull(),
  at: ts("at").notNull(),
}, (table) => ({
  eventIdIdx: index("ledger_entries_event_id_idx").on(table.eventId),
  orderIdIdx: index("ledger_entries_order_id_idx").on(table.orderId),
}));

export const disputes = pgTable("disputes", {
  disputeId: text("dispute_id").primaryKey(),
  orderId: text("order_id").references(() => orders.id),
  captureId: text("capture_id"),
  reason: text("reason").notNull(),
  amount: integer("amount"),
  status: text("status").notNull(),
  openedAt: ts("opened_at").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  agentDraft: text("agent_draft"),
  agentDraftAt: ts("agent_draft_at"),
  acceptApprovedBy: text("accept_approved_by"),
  acceptApprovedAt: ts("accept_approved_at"),
}, (table) => ({
  orderIdIdx: index("disputes_order_id_idx").on(table.orderId),
  statusIdx: index("disputes_status_idx").on(table.status),
}));

export const supplierInvoices = pgTable("supplier_invoices", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  source: text("source").notNull(),
  vendorName: text("vendor_name"),
  supplierId: text("supplier_id"),
  invoiceNumber: text("invoice_number"),
  currency: text("currency").notNull().default("USD"),
  amount: integer("amount").notNull(),
  dueDate: text("due_date"),
  lineItems: jsonb("line_items"),
  confidence: integer("confidence").notNull().default(0),
  lowConfidence: integer("low_confidence").notNull().default(0),
  rawText: text("raw_text"),
  paypalInvoiceId: text("paypal_invoice_id"),
  status: text("status").notNull().default("EXTRACTED"),
  matchStatus: text("match_status").notNull().default("UNMATCHED"),
  matchNotes: text("match_notes"),
  orderId: text("order_id"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (table) => ({
  ownerCreatedIdx: index("supplier_invoices_owner_created_idx").on(table.ownerId, table.createdAt),
  matchStatusIdx: index("supplier_invoices_match_status_idx").on(table.matchStatus),
}));

export const supplierReputation = pgTable("supplier_reputation", {
  supplierId: text("supplier_id").primaryKey(),
  onTimeScore: integer("on_time_score").notNull().default(500),
  disputeScore: integer("dispute_score").notNull().default(500),
  priceHonestyScore: integer("price_honesty_score").notNull().default(500),
  ordersCounted: integer("orders_counted").notNull().default(0),
  disputesCounted: integer("disputes_counted").notNull().default(0),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const payoutBatches = pgTable("payout_batches", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  paypalBatchId: text("paypal_batch_id"),
  status: text("status").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  invoiceId: text("invoice_id"),
  receiver: text("receiver").notNull(),
  note: text("note"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (table) => ({
  ownerCreatedIdx: index("payout_batches_owner_created_idx").on(table.ownerId, table.createdAt),
}));

export const preferences = pgTable("preferences", {
  ownerId: text("owner_id").primaryKey(),
  priceWeight: integer("price_weight").notNull(),
  speedWeight: integer("speed_weight").notNull(),
  decisions: integer("decisions").notNull().default(0),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const negotiations = pgTable("negotiations", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").notNull(),
  brief: text("brief").notNull(),
  priority: text("priority").notNull(),
  quantity: integer("quantity").notNull(),
  maxUnitPrice: integer("max_unit_price").notNull(),
  currency: text("currency").notNull(),
  neededByDays: integer("needed_by_days").notNull(),
  workflowRunId: text("workflow_run_id"),
  result: jsonb("result"),
  error: jsonb("error"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (table) => ({
  ownerCreatedIdx: index("negotiations_owner_created_idx").on(table.ownerId, table.createdAt),
  ownerIdempotencyIdx: uniqueIndex("negotiations_owner_idempotency_idx").on(table.ownerId, table.idempotencyKey),
  statusIdx: index("negotiations_status_idx").on(table.status),
  workflowRunIdIdx: index("negotiations_workflow_run_id_idx").on(table.workflowRunId),
}));