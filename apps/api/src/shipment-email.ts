export type ParsedShipmentEmail = {
  carrier: string;
  number: string;
  confidence: "high" | "medium" | "low";
  matchedBy: string;
};

function supplierLabel(supplierId: string): string {
  const cleaned = supplierId.trim() || "seller";
  return cleaned
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function supplierEmail(supplierId: string): string {
  const slug = (supplierId.trim() || "seller").toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `fulfillment@${slug}.example.com`;
}

/** Stable UPS-looking tracking that still parses with the 1Z rule. */
export function demoTrackingNumber(seed = "DEMO"): string {
  const hex = seed.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().padEnd(8, "0").slice(0, 8);
  return `1Z999AA10${hex}`;
}

/** Seller-branded shipment email for the winning supplier (demo inbox / Gmail paste). */
export function buildSellerShipmentEmail(opts: {
  supplierId: string;
  orderId?: string;
  trackingNumber?: string;
}): string {
  const supplierId = opts.supplierId || "seller";
  const label = supplierLabel(supplierId);
  const from = supplierEmail(supplierId);
  const tracking = opts.trackingNumber ?? demoTrackingNumber(opts.orderId ?? supplierId);
  return `Subject: Your order has shipped — ${label}
From: ${from}

Hi ProcureAI buyer,

Good news — ${label} has shipped your marketplace order${opts.orderId ? ` (${opts.orderId})` : ""}.

Carrier: UPS
Tracking number: ${tracking}

You can track delivery on the carrier site. Confirm receipt in ProcureAI when it arrives so funds can be captured.

Thanks,
${label} Fulfillment
`;
}

export function sampleShipmentEmail(supplierId = "seller-c"): string {
  return buildSellerShipmentEmail({ supplierId });
}

/** Deterministic parse of a pasted carrier / seller shipment email (Gmail copy-paste friendly). */
export function parseShipmentEmail(raw: string): ParsedShipmentEmail | null {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return null;

  const ups = text.match(/\b(1Z[0-9A-Z]{16})\b/i);
  if (ups) {
    return { carrier: "UPS", number: ups[1].toUpperCase(), confidence: "high", matchedBy: "UPS tracking" };
  }

  const fedex = text.match(/\b(\d{12,22})\b/);
  const mentionsFedex = /fed\s*ex|fedex/i.test(text);
  if (fedex && mentionsFedex) {
    return { carrier: "FEDEX", number: fedex[1], confidence: "medium", matchedBy: "FedEx + digits" };
  }

  const usps = text.match(/\b((?:94|93|92|95)\d{20}|\d{20,22})\b/);
  if (usps && /usps|united\s+states\s+postal/i.test(text)) {
    return { carrier: "USPS", number: usps[1], confidence: "medium", matchedBy: "USPS + digits" };
  }

  const labeled = text.match(
    /(?:tracking\s*(?:number|no\.?|#)?|track(?:ing)?\s*id)\s*[:#-]?\s*([A-Z0-9-]{8,32})/i,
  );
  if (labeled) {
    const carrier = /ups/i.test(text) ? "UPS"
      : /fed\s*ex|fedex/i.test(text) ? "FEDEX"
      : /usps|postal/i.test(text) ? "USPS"
        : /dhl/i.test(text) ? "DHL"
          : "CARRIER";
    return {
      carrier,
      number: labeled[1].toUpperCase(),
      confidence: "low",
      matchedBy: "labeled tracking field",
    };
  }

  return null;
}
