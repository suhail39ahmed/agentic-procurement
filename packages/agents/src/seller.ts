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
  
  export function getSeller(id: string): SellerConfig {
    const seller = sellers.find((s) => s.id === id);
    if (!seller) throw new Error(`Unknown seller ${id}`);
    return seller;
  }