import { loadRootEnv } from "../env";
import { upsertSeller } from "../repositories/sellers";
import { closeDatabase } from "../client";

loadRootEnv();

const SELLERS = [
  {
    id: "seller-a",
    name: "Anchor Office Supply",
    floorPrice: 150,
    listPrice: 210,
    stock: 500,
    leadTimeDays: 14,
    persona: "Opens high and concedes slowly in small steps. Emphasises quality and warranty.",
  },
  {
    id: "seller-b",
    name: "BundleWorks",
    floorPrice: 140,
    listPrice: 195,
    stock: 300,
    leadTimeDays: 18,
    persona: "Prefers volume deals. Offers better unit prices for larger quantities and bundled delivery.",
  },
  {
    id: "seller-c",
    name: "ValueSeat Direct",
    floorPrice: 120,
    listPrice: 165,
    stock: 1000,
    leadTimeDays: 35,
    persona: "Cheapest option with slow delivery. Competes hard on price, flexible on terms.",
  },
  {
    id: "seller-d",
    name: "Express Ergonomics",
    floorPrice: 185,
    listPrice: 240,
    stock: 80,
    leadTimeDays: 5,
    persona: "Premium and fast. Rarely discounts, justifies price with speed and service.",
  },
];

async function main() {
  console.log("Seeding sellers...");
  for (const seller of SELLERS) {
    await upsertSeller(seller);
    console.log(`  ${seller.id} ${seller.name}`);
  }
  console.log("Seed complete");
  await closeDatabase();
}

main().catch(async (err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  await closeDatabase().catch(() => undefined);
  process.exit(1);
});
