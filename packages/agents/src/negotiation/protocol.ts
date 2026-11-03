import { z } from "zod";

const Money = z.number().positive().max(1_000_000).multipleOf(0.01);
const Currency = z.enum(["USD"]);
const Id = z.string().min(1).max(64);

export const LineItem = z.object({
  sku: Id,
  description: z.string().min(1).max(200),
  quantity: z.number().int().positive().max(10_000),
});

const Base = z.object({
  rfqId: Id,
  from: Id,
  to: Id,
  round: z.number().int().min(0).max(10),
  sentAt: z.string().datetime(),
});

export const Rfq = Base.extend({
  type: z.literal("RFQ"),
  items: z.array(LineItem).min(1).max(50),
  maxUnitPrice: Money,
  currency: Currency,
  neededByDays: z.number().int().positive().max(365),
  brief: z.string().max(500).optional(),
});

export const Offer = Base.extend({
  type: z.literal("OFFER"),
  unitPrice: Money,
  currency: Currency,
  leadTimeDays: z.number().int().positive().max(365),
  validForHours: z.number().int().positive().max(168),
  message: z.string().max(500),
});

export const Counter = Base.extend({
  type: z.literal("COUNTER"),
  targetUnitPrice: Money,
  currency: Currency,
  message: z.string().max(500),
});

export const Accept = Base.extend({
  type: z.literal("ACCEPT"),
  unitPrice: Money,
  currency: Currency,
});

export const Reject = Base.extend({
  type: z.literal("REJECT"),
  reason: z.string().max(300),
});

export const NegotiationMessage = z.discriminatedUnion("type", [
  Rfq,
  Offer,
  Counter,
  Accept,
  Reject,
]);

export type NegotiationMessage = z.infer<typeof NegotiationMessage>;
export type RfqMessage = z.infer<typeof Rfq>;
export type OfferMessage = z.infer<typeof Offer>;
export type CounterMessage = z.infer<typeof Counter>;

export const MAX_ROUNDS = 3;