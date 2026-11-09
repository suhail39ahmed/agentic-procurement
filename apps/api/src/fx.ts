/** Static sandbox FX table → base USD (hackathon demo rates). */
export type QuoteCurrency = "USD" | "SGD" | "INR";

const TO_USD: Record<QuoteCurrency, number> = {
  USD: 1,
  SGD: 0.74,
  INR: 0.012,
};

export function isQuoteCurrency(value: unknown): value is QuoteCurrency {
  return value === "USD" || value === "SGD" || value === "INR";
}

export function toUsd(amount: number, currency: QuoteCurrency): number {
  return Math.round(amount * TO_USD[currency] * 100) / 100;
}

export function fromUsd(amountUsd: number, currency: QuoteCurrency): number {
  const rate = TO_USD[currency];
  return Math.round((amountUsd / rate) * 100) / 100;
}

export type FxQuoteInput = {
  supplier: string;
  unitPrice: number;
  currency: QuoteCurrency;
  leadTimeDays: number;
};

export type FxNormalizedQuote = FxQuoteInput & {
  unitPriceUsd: number;
  unitPriceBase: number;
  fxRateToUsd: number;
};

export function normalizeQuotes(
  quotes: FxQuoteInput[],
  base: QuoteCurrency = "USD",
): FxNormalizedQuote[] {
  return quotes.map((quote) => {
    const currency = isQuoteCurrency(quote.currency) ? quote.currency : "USD";
    const unitPriceUsd = toUsd(quote.unitPrice, currency);
    return {
      ...quote,
      currency,
      unitPriceUsd,
      unitPriceBase: base === "USD" ? unitPriceUsd : fromUsd(unitPriceUsd, base),
      fxRateToUsd: TO_USD[currency],
    };
  });
}

export function fxTable() {
  return {
    base: "USD" as const,
    asOf: "2026-11-01",
    rates: TO_USD,
    note: "Sandbox FX table for demo normalisation (not live market rates).",
  };
}
