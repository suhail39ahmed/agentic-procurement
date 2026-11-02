import { negotiate } from "./buyer-agent";
import { sellers } from "./seller";
import type { RfqMessage } from "./protocol";

const rfq: RfqMessage = {
  type: "RFQ",
  rfqId: `rfq-${Date.now()}`,
  from: "buyer",
  to: "*",
  round: 0,
  sentAt: new Date().toISOString(),
  items: [{ sku: "CHAIR-ERGO", description: "Ergonomic office chair", quantity: 50 }],
  maxUnitPrice: 200,
  currency: "USD",
  neededByDays: 30,
};

function describe(event: Parameters<Parameters<typeof negotiate>[2] & {}>[0]): string {
  const m = event.message;
  switch (m.type) {
    case "OFFER":
      return `R${m.round} ${m.from.padEnd(9)} OFFER   $${m.unitPrice.toFixed(2)} ${m.leadTimeDays}d`;
    case "COUNTER":
      return `R${m.round} buyer -> ${m.to.padEnd(9)} COUNTER $${m.targetUnitPrice.toFixed(2)}  ${m.message}`;
    case "REJECT":
      return `R${m.round} ${m.from.padEnd(9)} REJECT  ${m.reason}`;
    default:
      return `R${m.round} ${m.type}`;
  }
}

async function main() {
  const result = await negotiate(rfq, sellers, (event) => console.log(describe(event)));

  console.log("\nRanking");
  for (const s of result.ranking) {
    console.log(
      `  ${s.offer.from.padEnd(9)} $${s.offer.unitPrice.toFixed(2)} ${String(s.offer.leadTimeDays).padStart(2)}d  score ${s.score}${s.meetsDeadline ? "" : "  misses deadline"}${s.withinBudget ? "" : "  over budget"}`
    );
  }

  if (result.winner) {
    const list = sellers.find((s) => s.id === result.winner!.offer.from)!.listPrice;
    const saved = (list - result.winner.offer.unitPrice) * 50;
    console.log(`\nWinner ${result.winner.offer.from} at $${result.winner.offer.unitPrice.toFixed(2)} (saved $${saved.toFixed(2)} vs list)`);
  } else {
    console.log("\nNo eligible offer");
  }
  console.log(`\n${result.rationale}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});