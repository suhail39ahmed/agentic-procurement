import Link from "next/link";

export const instant = false;

export default function PayPalCancelPage() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "4rem auto", padding: "0 1.25rem" }}>
      <p style={{ letterSpacing: "0.08em", color: "#5b6b86", fontSize: 12, fontWeight: 700 }}>PAYPAL SANDBOX</p>
      <h1 style={{ color: "#142c52", fontSize: "2rem", margin: "0.4rem 0 0.75rem" }}>Checkout cancelled</h1>
      <p style={{ color: "#3d4f6f", lineHeight: 1.5 }}>
        No funds were held. You can reopen the approve link from Payments &amp; orders and try again.
      </p>
      <p style={{ marginTop: "1.5rem" }}>
        <Link
          href="/?paypal=cancelled"
          style={{
            display: "inline-block",
            background: "#0070e0",
            color: "white",
            textDecoration: "none",
            padding: "0.75rem 1.1rem",
            borderRadius: 10,
            fontWeight: 600,
          }}
        >
          Back to dashboard
        </Link>
      </p>
    </main>
  );
}
