import { Suspense } from "react";
import Link from "next/link";

export const instant = false;

async function ReturnBody({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; PayerID?: string }>;
}) {
  const params = await searchParams;
  const token = params.token?.trim() || "";

  return (
    <>
      <p style={{ letterSpacing: "0.08em", color: "#5b6b86", fontSize: 12, fontWeight: 700 }}>PAYPAL SANDBOX</p>
      <h1 style={{ color: "#142c52", fontSize: "2rem", margin: "0.4rem 0 0.75rem" }}>Buyer approval received</h1>
      <p style={{ color: "#3d4f6f", lineHeight: 1.5 }}>
        PayPal redirected back after you completed the sandbox checkout.
        {token ? <> Order token <code>{token}</code>.</> : null}
        {" "}Return to the dashboard and click <strong>Authorize hold</strong> to place funds on hold.
        Capture still waits until you confirm delivery.
      </p>
      <p style={{ marginTop: "1.5rem" }}>
        <Link
          href="/?paypal=approved"
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
          Back to Payments
        </Link>
      </p>
    </>
  );
}

export default function PayPalReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; PayerID?: string }>;
}) {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "4rem auto", padding: "0 1.25rem" }}>
      <Suspense fallback={<p>Confirming PayPal return…</p>}>
        <ReturnBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
