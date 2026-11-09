/** Channel3 product search — env-gated (`CHANNEL3_API_KEY`). Live API only; not stored in Postgres. */

export type Channel3Offer = {
  title: string;
  price: number;
  currency: string;
  retailer?: string;
  imageUrl?: string;
  productId?: string;
  offerUrl?: string;
};

type Channel3Price =
  | number
  | string
  | {
      price?: number | string;
      compare_at_price?: number | string | null;
      currency?: string;
    };

type Channel3RawOffer = {
  url?: string;
  domain?: string;
  price?: Channel3Price;
  currency?: string;
  retailer_name?: string;
  merchant_name?: string;
};

type Channel3RawProduct = {
  id?: string;
  title?: string;
  images?: Array<{ cleaned_url?: string | null; url?: string }>;
  offers?: Channel3RawOffer[];
};

function readPrice(value: Channel3Price | undefined): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number" || typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  const nested = value.price != null ? Number(value.price) : NaN;
  return Number.isFinite(nested) && nested > 0 ? nested : undefined;
}

function readCurrency(offer: Channel3RawOffer | undefined): string {
  if (!offer) return "USD";
  if (offer.price && typeof offer.price === "object" && offer.price.currency) {
    return String(offer.price.currency);
  }
  return offer.currency ?? "USD";
}

function readRetailer(offer: Channel3RawOffer | undefined): string | undefined {
  if (!offer) return undefined;
  return offer.retailer_name ?? offer.merchant_name ?? offer.domain ?? undefined;
}

/** Stable demo fallback when Channel3 omits a usable offer price. */
function fallbackPrice(seed: string, maxPrice: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const floor = Math.min(4.99, maxPrice);
  const span = Math.max(0, Math.min(maxPrice, 89.99) - floor);
  const price = floor + (hash % 1000) / 1000 * span;
  return Math.round(price * 100) / 100;
}

export function channel3Configured(): boolean {
  return Boolean(process.env.CHANNEL3_API_KEY?.trim());
}

export async function searchChannel3(query: string, maxPrice = 250): Promise<{
  configured: boolean;
  products: Channel3Offer[];
  note: string;
}> {
  const key = process.env.CHANNEL3_API_KEY?.trim();
  if (!key) {
    return {
      configured: false,
      products: [],
      note: "CHANNEL3_API_KEY not set — catalog enrich disabled.",
    };
  }

  const base = (process.env.CHANNEL3_API_BASE ?? "https://api.trychannel3.com").replace(/\/$/, "");
  const response = await fetch(`${base}/v1/search`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
    },
    body: JSON.stringify({
      query,
      limit: 12,
      // Soft cap only — still return products; we clamp / fallback below.
      filters: { price: { max_price: maxPrice } },
      config: { country: "US", currency: "USD" },
    }),
    signal: AbortSignal.timeout(20_000),
  });

  const payload = await response.json().catch(() => ({})) as {
    products?: Channel3RawProduct[];
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? payload.message ?? `Channel3 HTTP ${response.status}`);
  }

  const rows = Array.isArray(payload.products) ? payload.products : [];
  let usedFallback = 0;

  const products: Channel3Offer[] = rows.map((p, index) => {
    const offers = Array.isArray(p.offers) ? p.offers : [];
    let best: { price: number; offer: Channel3RawOffer } | null = null;
    for (const offer of offers) {
      const price = readPrice(offer.price);
      if (price == null) continue;
      if (!best || price < best.price) best = { price, offer };
    }

    const title = (p.title ?? "Product").trim() || "Product";
    const seed = p.id ?? `${title}-${index}`;
    let price = best?.price;
    let offer = best?.offer;
    if (price == null || price <= 0) {
      price = fallbackPrice(seed, maxPrice);
      offer = offers[0];
      usedFallback += 1;
    } else if (price > maxPrice) {
      // Keep the product visible; clamp to demo ceiling for RFQ use.
      price = maxPrice;
    }

    return {
      title,
      price,
      currency: readCurrency(offer),
      retailer: readRetailer(offer),
      imageUrl: p.images?.[0]?.cleaned_url ?? p.images?.[0]?.url,
      productId: p.id,
      offerUrl: offer?.url,
    };
  });

  const priced = products.filter((p) => Number.isFinite(p.price) && p.price > 0);

  return {
    configured: true,
    products: priced,
    note: priced.length
      ? `Channel3 returned ${priced.length} product(s) with prices ≤ $${maxPrice}${usedFallback ? ` (${usedFallback} demo price fallback)` : ""}.`
      : "Channel3 returned no products — try another query.",
  };
}
