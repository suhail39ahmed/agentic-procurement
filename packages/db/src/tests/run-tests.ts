import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { closeDatabase, withTransaction } from "../client";
import { fromCents, toCents, dollarsToFixed } from "../money";
import { getSeller, listSellers, upsertSeller } from "../repositories/sellers";
import { saveOrder, getOrder } from "../repositories/orders";
import { saveWebhookEvent, listWebhookEvents } from "../repositories/webhooks";
import { issueMandateRecord, consumeMandate } from "../repositories/mandates";

const failures: string[] = [];

function assert(cond: unknown, message: string) {
  if (!cond) {
    failures.push(message);
    console.error(`FAIL ${message}`);
  } else {
    console.log(`PASS ${message}`);
  }
}

async function money() {
  console.log("\n== money conversion");
  assert(toCents(2.5) === 250, "2.50 dollars -> 250 cents");
  assert(toCents(0.5) === 50, "0.50 dollars -> 50 cents");
  assert(fromCents(15000) === 150, "15000 cents -> 150 dollars");
  assert(dollarsToFixed(2.5) === "2.50", "display 2.50");
  assert(fromCents(toCents(2.5)) === 2.5, "round-trip 2.5");
}

async function sellers() {
  console.log("\n== sellers");
  const all = await listSellers();
  assert(all.length === 4, `four sellers, got ${all.length}`);
  const a = await getSeller("seller-a");
  assert(a?.name === "Anchor Office Supply", "seller-a name");
  assert(a?.floorPrice === 150, `seller-a floor stays dollars, got ${a?.floorPrice}`);
  await upsertSeller(a!);
  const again = await getSeller("seller-a");
  assert(again?.floorPrice === 150, "idempotent upsert keeps dollars");
}

async function ordersAndWebhooks() {
  console.log("\n== orders and webhook dedup");
  const id = `ord-${randomUUID()}`;
  await saveOrder({
    id,
    rfqId: "rfq-1",
    supplierId: "seller-b",
    amount: 2.5,
    currency: "USD",
    status: "APPROVED",
    history: [],
  });
  const loaded = await getOrder(id);
  assert(loaded?.amount === 2.5, `order amount dollars after persist, got ${loaded?.amount}`);

  const eventId = `wh-${randomUUID()}`;
  const event = {
    id: eventId,
    eventType: "PAYMENT.AUTHORIZATION.CREATED",
    createTime: new Date().toISOString(),
    raw: {},
    receivedAt: new Date().toISOString(),
  };
  assert(await saveWebhookEvent(event) === true, "first webhook insert");
  assert(await saveWebhookEvent(event) === false, "duplicate webhook rejected");
  const [a, b] = await Promise.all([saveWebhookEvent({ ...event, id: `${eventId}-c1` }), saveWebhookEvent({ ...event, id: `${eventId}-c1` })]);
  assert(a !== b, "concurrent same-id webhook: one insert only");
  assert((await listWebhookEvents()).length >= 2, "webhook events listed");
}

async function mandates() {
  console.log("\n== mandate consumption");
  const jti = randomUUID();
  const now = new Date();
  await issueMandateRecord({
    jti,
    rfqId: "rfq-m",
    supplierId: "seller-c",
    amountDollars: 2.5,
    currency: "USD",
    approvedBy: "owner@company.com",
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
  });
  const first = await consumeMandate(jti);
  const second = await consumeMandate(jti);
  assert(first === "consumed", `first consume, got ${first}`);
  assert(second === "used", `second consume blocked, got ${second}`);

  const expired = randomUUID();
  await issueMandateRecord({
    jti: expired,
    rfqId: "rfq-m",
    supplierId: "seller-c",
    amountDollars: 2.5,
    currency: "USD",
    approvedBy: "policy:auto",
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() - 1000).toISOString(),
  });
  assert((await consumeMandate(expired)) === "expired", "expired mandate not consumed");

  const concurrent = randomUUID();
  await issueMandateRecord({
    jti: concurrent,
    rfqId: "rfq-m",
    supplierId: "seller-c",
    amountDollars: 0.5,
    currency: "USD",
    approvedBy: "policy:auto",
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
  });
  const results = await Promise.all([consumeMandate(concurrent), consumeMandate(concurrent)]);
  const consumed = results.filter((r) => r === "consumed").length;
  assert(consumed === 1, `concurrent consume exactly once, got ${results.join(",")}`);
}

async function rollback() {
  console.log("\n== transaction rollback");
  const id = `ord-rb-${randomUUID()}`;
  try {
    await withTransaction(async () => {
      await saveOrder({
        id,
        rfqId: "rfq-rb",
        supplierId: "seller-d",
        amount: 1.25,
        currency: "USD",
        status: "DRAFT",
        history: [],
      });
      throw new Error("boom");
    });
  } catch (err) {
    assert((err as Error).message === "boom", "transaction threw");
  }
  assert((await getOrder(id)) === undefined, "rolled back order is absent");
}

async function crossConnection() {
  console.log("\n== cross-connection read");
  const id = `ord-x-${randomUUID()}`;
  await saveOrder({
    id,
    rfqId: "rfq-x",
    supplierId: "seller-a",
    amount: 0.5,
    currency: "USD",
    status: "DRAFT",
    history: [],
  });
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const other = postgres(url, { max: 1 });
  const rows = await other<{ amount: number }[]>`SELECT amount FROM orders WHERE id = ${id}`;
  await other.end();
  assert(rows[0]?.amount === 50, `second connection sees 50 cents, got ${rows[0]?.amount}`);
}

async function main() {
  await money();
  await sellers();
  await ordersAndWebhooks();
  await mandates();
  await rollback();
  await crossConnection();
  await closeDatabase();
  if (failures.length > 0) {
    console.error(`\n${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log("\nAll db tests passed");
}

main().catch(async (err) => {
  console.error(err);
  await closeDatabase().catch(() => undefined);
  process.exit(1);
});
