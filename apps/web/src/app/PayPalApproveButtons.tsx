"use client";

import { useEffect, useState } from "react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import s from "./dashboard.module.css";

type BrowserConfig = {
  clientId: string;
  currency: string;
  intent: "authorize" | "capture";
};

export function paypalOrderIdFromApproveUrl(approveUrl?: string | null): string | null {
  if (!approveUrl) return null;
  try {
    return new URL(approveUrl).searchParams.get("token");
  } catch {
    return null;
  }
}

export function PayPalApproveButtons({
  paypalOrderId,
  onApproved,
  onCancel,
  onError,
}: {
  paypalOrderId: string;
  onApproved: () => void | Promise<void>;
  onCancel?: () => void;
  onError?: (message: string) => void;
}) {
  const [config, setConfig] = useState<BrowserConfig | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/paypal/browser-config", { cache: "no-store" });
        const payload = await response.json().catch(() => ({})) as BrowserConfig & { error?: string };
        if (!response.ok || !payload.clientId) {
          if (!cancelled) setLoadError(payload.error ?? "PayPal client id unavailable.");
          return;
        }
        if (!cancelled) {
          setConfig({
            clientId: payload.clientId,
            currency: payload.currency || "USD",
            intent: payload.intent === "capture" ? "capture" : "authorize",
          });
        }
      } catch {
        if (!cancelled) setLoadError("Could not load PayPal button config.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return <p className={s.description}>{loadError} Use the Approve on PayPal link below.</p>;
  }
  if (!config) {
    return <p className={s.description}>Loading PayPal checkout…</p>;
  }

  return (
    <div className={s.paypalButtons}>
      <p className={s.description}>
        Pay with PayPal opens a sandbox popup on this page — approve as the buyer, then we place the authorize hold.
      </p>
      <PayPalScriptProvider
        options={{
          clientId: config.clientId,
          currency: config.currency,
          intent: config.intent,
          components: "buttons",
        }}
      >
        <PayPalButtons
          style={{ layout: "vertical", shape: "rect", label: "paypal", height: 42 }}
          disabled={!paypalOrderId}
          createOrder={() => Promise.resolve(paypalOrderId)}
          onApprove={async () => {
            await onApproved();
          }}
          onCancel={() => {
            onCancel?.();
          }}
          onError={(err) => {
            const message = err instanceof Error ? err.message : "PayPal button error";
            onError?.(message);
          }}
        />
      </PayPalScriptProvider>
    </div>
  );
}
