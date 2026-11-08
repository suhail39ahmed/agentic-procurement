import { pgTable, text, integer, timestamp, jsonb, index, primaryKey } from "drizzle-orm/pg-core";

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
}, (table) => ({
  orderIdIdx: index("disputes_order_id_idx").on(table.orderId),
  statusIdx: index("disputes_status_idx").on(table.status),
}));

export const preferences = pgTable("preferences", {
  ownerId: text("owner_id").primaryKey(),
  priceWeight: integer("price_weight").notNull(),
  speedWeight: integer("speed_weight").notNull(),
  decisions: integer("decisions").notNull().default(0),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});
