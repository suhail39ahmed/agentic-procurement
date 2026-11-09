/** Channel3 product search — env-gated (`CHANNEL3_API_KEY`). */
export type Channel3Offer = {
  title: string;
  price?: number;
  currency?: string;
  retailer?: string;
  imageUrl?: string;
  productId?: string;
};

export function channel3Configured(): boolean {
  return Boolean(process.env.CHANNEL3_API_KEY?.trim());
}

export async function searchChannel3(query: string, maxPrice = 2): Promise<{
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
      limit: 8,
      filters: { price: { max_price: maxPrice } },
      config: { country: "US", currency: "USD" },
    }),
    signal: AbortSignal.timeout(20_000),
  });

  const payload = await response.json().catch(() => ({})) as {
    products?: Array<{
      id?: string;
      title?: string;
      images?: Array<{ cleaned_url?: string | null; url?: string }>;
      offers?: Array<{ price?: number; currency?: string; retailer_name?: string; merchant_name?: string }>;
    }>;
    data?: unknown;
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? payload.message ?? `Channel3 HTTP ${response.status}`);
  }

  const rows = Array.isArray(payload.products) ? payload.products : [];
  const products: Channel3Offer[] = rows.flatMap((p) => {
    const offer = p.offers?.[0];
    const priceNum = offer?.price != null ? Number(offer.price) : NaN;
    const price = Number.isFinite(priceNum) ? priceNum : undefined;
    if (price != null && price > maxPrice) return [];
    return [{
      title: p.title ?? "Product",
      price,
      currency: offer?.currency ?? "USD",
      retailer: offer?.retailer_name ?? offer?.merchant_name,
      imageUrl: p.images?.[0]?.cleaned_url ?? p.images?.[0]?.url,
      productId: p.id,
    }];
  });

  return {
    configured: true,
    products,
    note: products.length
      ? `Channel3 returned ${products.length} product(s) ≤ $${maxPrice}.`
      : "Channel3 returned no products under the demo price cap.",
  };
}
