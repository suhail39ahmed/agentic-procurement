export type DemoRole = "buyer" | "owner" | "seller";

export type DemoSession = {
  role: DemoRole;
  name: string;
  signedInAt: string;
};

const STORAGE_KEY = "procureai.demoSession";

export const DEMO_ACCOUNTS = {
  buyer: {
    role: "buyer" as const,
    name: "Buyer · Purchasing",
    username: "buyer",
    password: "buyer",
    blurb: "Buy path: RFQ → PayPal → ship email → capture. Opens disputes when goods are wrong. Cannot approve spend or accept claims.",
  },
  owner: {
    role: "owner" as const,
    name: "Supervisor · Approvals",
    username: "supervisor",
    password: "supervisor",
    blurb: "Same buy path + over-$20 spend approve. Does not accept seller-side dispute claims.",
    aliases: ["owner"] as const,
  },
  seller: {
    role: "seller" as const,
    name: "Seller · Fulfillment",
    username: "seller",
    password: "seller",
    blurb: "Supplier view for disputes only. Sees buyer claims and can Approve accept_dispute_claim via PayPal Toolkit.",
  },
} as const;

export function readDemoSession(): DemoSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoSession>;
    if (parsed.role !== "buyer" && parsed.role !== "owner" && parsed.role !== "seller") return null;
    if (!parsed.name || !parsed.signedInAt) return null;
    return { role: parsed.role, name: parsed.name, signedInAt: parsed.signedInAt };
  } catch {
    return null;
  }
}

export function writeDemoSession(session: DemoSession): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearDemoSession(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function demoRoleHeaders(role: DemoRole | null | undefined): HeadersInit {
  if (!role) return {};
  return { "x-demo-role": role };
}

export function isOwnerRole(role: DemoRole | null | undefined): boolean {
  return role === "owner";
}

export function isSellerRole(role: DemoRole | null | undefined): boolean {
  return role === "seller";
}

/** Supervisor = over-$20 spend approve (not dispute accept). */
export function isSupervisorRole(role: DemoRole | null | undefined): boolean {
  return isOwnerRole(role);
}
