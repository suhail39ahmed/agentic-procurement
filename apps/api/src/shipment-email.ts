export type ParsedShipmentEmail = {
  carrier: string;
  number: string;
  confidence: "high" | "medium" | "low";
  matchedBy: string;
};

const SAMPLE_SHIPMENT_EMAIL = `Subject: Your order has shipped
From: fulfillment@seller-c.example.com

Hi ProcureAI buyer,

Good news — your marketplace order is on the way.

Carrier: UPS
Tracking number: 1Z999AA10123456784

You can track delivery on the carrier site. Please confirm receipt in ProcureAI when it arrives so funds can be captured.

Thanks,
Seller C Fulfillment
`;

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

export function sampleShipmentEmail(): string {
  return SAMPLE_SHIPMENT_EMAIL;
}
