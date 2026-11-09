export type DemoRole = "buyer" | "owner";

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
    blurb: "Create RFQs, negotiate, checkout, PayPal approve. Cannot approve over-threshold spends or capture.",
  },
  owner: {
    role: "owner" as const,
    name: "Owner · Controller",
    username: "owner",
    password: "owner",
    blurb: "Approve spends over $20, confirm delivery & capture, accept disputes.",
  },
} as const;

export function readDemoSession(): DemoSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoSession>;
    if (parsed.role !== "buyer" && parsed.role !== "owner") return null;
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
