import {
  claimNegotiationRun,
  getNegotiationForOwner,
  listSupplierReputation,
  updateNegotiationRun,
  type Negotiation,
  type NegotiationPriority,
} from "db";
import { negotiate, sellersForBudget, type NegotiationEvent, type RfqMessage, type Weights } from "agents";

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
  const liveEvents: NegotiationEvent[] = [];
  let persistChain: Promise<void> = Promise.resolve();

  const persistLive = (events: NegotiationEvent[]) => {
    persistChain = persistChain.then(async () => {
      await updateNegotiationRun({
        id,
        ownerId,
        status: "RUNNING",
        result: { events, streaming: true },
      });
    }).catch((err) => {
      console.warn(`[negotiations] live event persist failed ${id}:`, err);
    });
  };

  try {
    let reputation: Record<string, { onTimeScore?: number; disputeScore?: number; priceHonestyScore?: number }> = {};
    try {
      const rows = await listSupplierReputation();
      reputation = Object.fromEntries(rows.map((row) => [row.supplierId, row]));
    } catch {
      // reputation table may not be migrated yet on older deploys
    }

    const rfq = toRfq(claimed);
    const result = await negotiate(
      rfq,
      sellersForBudget(rfq.maxUnitPrice),
      (event) => {
        liveEvents.push(event);
        persistLive([...liveEvents]);
      },
      priorityWeights[claimed.priority],
      reputation,
    );
    await persistChain;
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
    await persistChain;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[negotiations] failed ${id}:`, message);
    await updateNegotiationRun({
      id,
      ownerId,
      status: "FAILED",
      error: { message },
      result: liveEvents.length > 0 ? { events: liveEvents, streaming: false } : null,
    });
  }
}

export function scheduleNegotiationRun(ownerId: string, id: string): void {
  setImmediate(() => {
    void runNegotiation(ownerId, id);
  });
}
