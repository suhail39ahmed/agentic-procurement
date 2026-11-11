/** Cross-tab bridge: Seller Create & send → Buyer Payables From email. */

export type SellerApEmailEvent = {
  invoiceId: string;
  to: string;
  amount: string;
  note: string;
  vendor?: string;
  at: string;
};

export const SELLER_AP_EMAIL_KEY = "procureai:seller-ap-email";

export function publishSellerApEmail(event: SellerApEmailEvent): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SELLER_AP_EMAIL_KEY, JSON.stringify(event));
}

export function readPendingSellerApEmail(): SellerApEmailEvent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SELLER_AP_EMAIL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SellerApEmailEvent;
    if (!parsed?.invoiceId || !parsed?.at) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingSellerApEmail(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SELLER_AP_EMAIL_KEY);
}

export function subscribeSellerApEmail(
  onEvent: (event: SellerApEmailEvent) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handler = (e: StorageEvent) => {
    if (e.key !== SELLER_AP_EMAIL_KEY || !e.newValue) return;
    try {
      const parsed = JSON.parse(e.newValue) as SellerApEmailEvent;
      if (parsed?.invoiceId) onEvent(parsed);
    } catch {
      /* ignore */
    }
  };

  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
