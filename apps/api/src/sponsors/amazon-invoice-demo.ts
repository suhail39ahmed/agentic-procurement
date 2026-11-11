/** Canonical text layer for /demo/amazon-invoice — used when KERNEL/direct fetch hits that path. */
export const AMAZON_INVOICE_DEMO_TEXT = `TAX INVOICE
Document: INV-AMZ-5520.pdf
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Vendor:     Amazon Business (demo)
Bill to:    ProcureAI Sandbox
Invoice #:  INV-AMZ-5520
Due date:   2026-12-01
PO ref:     PO-AMZ-5520

Line items:
  USB-C docking hub pack × 1 @ 55.00 USD

Subtotal:   55.00 USD
Tax:         0.00 USD
Total due:  55.00 USD

Remit to: seller-a@business.example.com
`;

export function isAmazonInvoiceDemoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/\/$/, "").endsWith("/demo/amazon-invoice");
  } catch {
    return false;
  }
}
