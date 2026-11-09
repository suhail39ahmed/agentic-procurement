export type SellerConfig = {
    id: string;
    name: string;
    floorPrice: number;
    listPrice: number;
    stock: number;
    leadTimeDays: number;
    persona: string;
  };
  
  export const sellers: SellerConfig[] = [
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
  
  /** Micro-price sellers for DEMO_MAX_USD / ≤$2 sandbox smoke tests. */
  export const microSellers: SellerConfig[] = [
    {
      id: "seller-micro-a",
      name: "Pixel Supplies Co",
      floorPrice: 0.85,
      listPrice: 1.75,
      stock: 5000,
      leadTimeDays: 7,
      persona: "Opens near list and concedes toward floor for small demo SKUs.",
    },
    {
      id: "seller-micro-b",
      name: "BundleBits",
      floorPrice: 0.7,
      listPrice: 1.5,
      stock: 8000,
      leadTimeDays: 12,
      persona: "Volume-friendly micro goods; quick concessions on unit price.",
    },
    {
      id: "seller-micro-c",
      name: "ValueStickers Direct",
      floorPrice: 0.55,
      listPrice: 1.2,
      stock: 20_000,
      leadTimeDays: 21,
      persona: "Cheapest micro SKU with slower delivery.",
    },
    {
      id: "seller-micro-d",
      name: "Express Mini Packs",
      floorPrice: 1.1,
      listPrice: 1.95,
      stock: 2000,
      leadTimeDays: 3,
      persona: "Premium-fast micro packs; small discounts only.",
    },
  ];

  export function sellersForBudget(maxUnitPriceUsd: number): SellerConfig[] {
    return maxUnitPriceUsd <= 2 ? microSellers : sellers;
  }

  export function getSeller(id: string): SellerConfig {
    const seller = sellers.find((s) => s.id === id) ?? microSellers.find((s) => s.id === id);
    if (!seller) throw new Error(`Unknown seller ${id}`);
    return seller;
  }