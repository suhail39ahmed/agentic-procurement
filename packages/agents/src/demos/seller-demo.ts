import { sellerRespond } from "../negotiation/seller-agent";
import { sellers } from "../negotiation/seller";
import type { RfqMessage } from "../negotiation/protocol";

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

async function main() {
  const replies = await Promise.all(
    sellers.map((seller) => sellerRespond(seller, rfq, []))
  );

  for (const reply of replies) {
    if (reply.type === "OFFER") {
      console.log(
        `${reply.from.padEnd(10)} OFFER  $${reply.unitPrice.toFixed(2).padStart(7)}  ${String(reply.leadTimeDays).padStart(3)}d  ${reply.message}`
      );
    } else {
      console.log(`${reply.from.padEnd(10)} REJECT ${reply.reason}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});