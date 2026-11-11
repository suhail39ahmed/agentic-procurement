/** Demo invoice “PDFs” as text layers — Render-safe (no blob disk). */

export type InvoiceSampleDoc = {
  id: string;
  filename: string;
  vendor: string;
  amountLabel: string;
  summary: string;
  text: string;
};

export const INVOICE_STORAGE_SAMPLES: InvoiceSampleDoc[] = [
  {
    id: "inv-bundlebits",
    filename: "INV-BB-4500.pdf",
    vendor: "BundleBits Supply Co",
    amountLabel: "$45.00",
    summary: "Office supplies restock",
    text: `TAX INVOICE
Document: INV-BB-4500.pdf
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Vendor:     BundleBits Supply Co
Bill to:    ProcureAI Sandbox
Invoice #:  INV-DEMO-4500
Due date:   2026-11-20
PO ref:     PO-AP-4500

Line items:
  Office supplies restock pack × 1 @ 45.00 USD

Subtotal:   45.00 USD
Tax:         0.00 USD
Total due:  45.00 USD

Remit to: seller-a@business.example.com
`,
  },
  {
    id: "inv-acme",
    filename: "INV-ACME-8821.pdf",
    vendor: "Acme Industrial Parts",
    amountLabel: "$128.50",
    summary: "Docking station lot",
    text: `SUPPLIER INVOICE
Document: INV-ACME-8821.pdf
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Vendor:     Acme Industrial Parts
Bill to:    ProcureAI Sandbox
Invoice #:  INV-ACME-8821
Due date:   2026-12-01
PO ref:     PO-AP-8821

Line items:
  USB-C docking station × 15 @ 8.00 USD
  Freight flat            8.50 USD

Subtotal:  128.50 USD
Total due: 128.50 USD

Remit to: seller-b@business.example.com
`,
  },
  {
    id: "inv-harbor",
    filename: "INV-HL-1102.pdf",
    vendor: "Harbor Labs Supply",
    amountLabel: "$19.80",
    summary: "Eco sticky notes",
    text: `INVOICE
Document: INV-HL-1102.pdf
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Vendor:     Harbor Labs Supply
Bill to:    ProcureAI Sandbox
Invoice #:  INV-HL-1102
Due date:   2026-11-28
PO ref:     PO-AP-1102

Line items:
  Eco sticky notes pack × 200 @ 0.099 USD

Total due: 19.80 USD

Remit to: seller-a@business.example.com
`,
  },
];

export function getInvoiceSample(id: string): InvoiceSampleDoc | undefined {
  return INVOICE_STORAGE_SAMPLES.find((doc) => doc.id === id);
}

export function buildSupplierInvoiceEmail(doc: InvoiceSampleDoc): string {
  return `From: ap@${doc.vendor.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example.com
To: payables@procureai.demo
Subject: Invoice ${doc.filename.replace(".pdf", "")} attached
Date: Tue, 11 Nov 2026 07:40:00 +0000

Hello Payables,

Please find attached our tax invoice for recent supply.

Attachment: ${doc.filename}
Vendor: ${doc.vendor}
Amount: ${doc.amountLabel}
Note: ${doc.summary}

——— PDF text layer (agent extract) ———
${doc.text}
`;
}

/** Live Seller Create & send → Buyer email body (amount/id/note from Seller desk). */
export function buildLiveSellerInvoiceEmail(opts: {
  invoiceId: string;
  amount: number;
  note: string;
  to: string;
  vendor?: string;
}): string {
  const vendor = (opts.vendor?.trim() || "BundleBits Supply Co");
  const amountLabel = opts.amount.toFixed(2);
  const due = new Date();
  due.setUTCDate(due.getUTCDate() + 14);
  const dueDate = due.toISOString().slice(0, 10);
  const filename = `${opts.invoiceId}.pdf`;
  const text = `TAX INVOICE
Document: ${filename}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Vendor:     ${vendor}
Bill to:    ProcureAI Sandbox
Invoice #:  ${opts.invoiceId}
Due date:   ${dueDate}
PO ref:     PO-AP-${amountLabel.replace(".", "")}

Line items:
  ${opts.note || "Supplier invoice"} × 1 @ ${amountLabel} USD

Subtotal:   ${amountLabel} USD
Tax:         0.00 USD
Total due:  ${amountLabel} USD

Remit to: seller-a@business.example.com
`;

  return `From: ap@${vendor.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example.com
To: ${opts.to || "payables@procureai.demo"}
Subject: Invoice ${opts.invoiceId} attached — $${amountLabel}
Date: ${new Date().toUTCString()}

Hello Payables,

Please find attached our tax invoice from Seller Create & send.

Attachment: ${filename}
Vendor: ${vendor}
Amount: $${amountLabel}
Note: ${opts.note || "Supplier invoice"}

——— PDF text layer (agent extract) ———
${text}
`;
}
