import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Amazon Business invoice · INV-AMZ-5520 (demo)",
  description: "Public demo invoice page for ProcureAI Payables KERNEL / web intake",
};

/** Public fake Amazon Business invoice — fetchable by KERNEL / direct HTML for Payables extract. */
export default function AmazonInvoiceDemoPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        margin: 0,
        padding: "32px 16px 64px",
        background: "#eaeded",
        color: "#0f1111",
        fontFamily: "Amazon Ember, Arial, Helvetica, sans-serif",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto", background: "#fff", border: "1px solid #d5d9d9", borderRadius: 8, overflow: "hidden" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "18px 24px", background: "#232f3e", color: "#fff" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 0.2 }}>amazon business</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>Tax invoice · sandbox demo for ProcureAI</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 13 }}>
            <div>Invoice # INV-AMZ-5520</div>
            <div>Order # 111-2849103-5520198</div>
          </div>
        </header>

        <section style={{ padding: "22px 24px", borderBottom: "1px solid #e7e9ec" }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            Sold by: <strong>Amazon.com Services LLC</strong> (demo vendor)<br />
            Bill to: <strong>ProcureAI Sandbox</strong> · payables@procureai.demo<br />
            Ship to: ProcureAI HQ receiving dock
          </p>
        </section>

        <section style={{ padding: "8px 24px 20px" }}>
          <h1 style={{ fontSize: 18, margin: "16px 0 12px" }}>Invoice details</h1>
          <pre
            style={{
              margin: 0,
              padding: 16,
              background: "#f7f8f8",
              border: "1px solid #e7e9ec",
              borderRadius: 6,
              whiteSpace: "pre-wrap",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >{`TAX INVOICE
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
`}
          </pre>
        </section>

        <footer style={{ padding: "14px 24px 22px", fontSize: 12, color: "#565959" }}>
          Demo only — not a real Amazon invoice. Used by ProcureAI Payables → Web page (KERNEL) intake.
        </footer>
      </div>
    </main>
  );
}
