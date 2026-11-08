import {
  claimNegotiationRun,
  getNegotiationForOwner,
  updateNegotiationRun,
  type Negotiation,
  type NegotiationPriority,
} from "db";
import { negotiate, sellers, type RfqMessage, type Weights } from "agents";

const priorityWeights: Record<NegotiationPriority, Weights> = {
  price: { price: 0.85, speed: 0.15 },
  speed: { price: 0.15, speed: 0.85 },
  balanced: { price: 0.7, speed: 0.3 },
};

function toRfq(row: Negotiation): RfqMessage {
  const description = row.brief.slice(0, 200) || "Procurement item";
  return {
    type: "RFQ",
    rfqId: row.id,
    from: "buyer",
    to: "*",
    round: 0,
    sentAt: new Date().toISOString(),
    items: [{
      sku: "ITEM-001",
      description,
      quantity: row.quantity,
    }],
    maxUnitPrice: row.maxUnitPrice,
    currency: "USD",
    neededByDays: row.neededByDays,
    brief: row.brief,
  };
}

export async function runNegotiation(ownerId: string, id: string): Promise<void> {
  const claimed = await claimNegotiationRun(ownerId, id);
  if (!claimed) {
    const current = await getNegotiationForOwner(ownerId, id);
    console.log(`[negotiations] skip start ${id}: status=${current?.status ?? "missing"}`);
    return;
  }

  console.log(`[negotiations] running ${id}`);
  try {
    const result = await negotiate(
      toRfq(claimed),
      sellers,
      undefined,
      priorityWeights[claimed.priority],
    );
    const serialized = JSON.parse(JSON.stringify(result));
    await updateNegotiationRun({
      id,
      ownerId,
      status: "SUCCEEDED",
      workflowRunId: `local-${id}`,
      result: serialized,
      error: null,
    });
    console.log(`[negotiations] succeeded ${id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[negotiations] failed ${id}:`, message);
    await updateNegotiationRun({
      id,
      ownerId,
      status: "FAILED",
      error: { message },
      result: null,
    });
  }
}

export function scheduleNegotiationRun(ownerId: string, id: string): void {
  setImmediate(() => {
    void runNegotiation(ownerId, id);
  });
}
