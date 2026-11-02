import type { OfferMessage, RfqMessage } from "./protocol";

export type ScoredOffer = {
  offer: OfferMessage;
  score: number;
  priceScore: number;
  speedScore: number;
  meetsDeadline: boolean;
  withinBudget: boolean;
};

export type Weights = { price: number; speed: number };

export const DEFAULT_WEIGHTS: Weights = { price: 0.7, speed: 0.3 };

export function scoreOffers(
  rfq: RfqMessage,
  offers: OfferMessage[],
  weights: Weights = DEFAULT_WEIGHTS
): ScoredOffer[] {
  if (offers.length === 0) return [];

  const prices = offers.map((o) => o.unitPrice);
  const leads = offers.map((o) => o.leadTimeDays);
  const [minPrice, maxPrice] = [Math.min(...prices), Math.max(...prices)];
  const [minLead, maxLead] = [Math.min(...leads), Math.max(...leads)];

  const normalize = (value: number, min: number, max: number) =>
    max === min ? 1 : 1 - (value - min) / (max - min);

  return offers
    .map((offer) => {
      const priceScore = normalize(offer.unitPrice, minPrice, maxPrice);
      const speedScore = normalize(offer.leadTimeDays, minLead, maxLead);
      const meetsDeadline = offer.leadTimeDays <= rfq.neededByDays;
      const withinBudget = offer.unitPrice <= rfq.maxUnitPrice;
      const eligible = meetsDeadline && withinBudget;
      const score = eligible ? weights.price * priceScore + weights.speed * speedScore : 0;
      return { offer, score: Math.round(score * 1000) / 1000, priceScore, speedScore, meetsDeadline, withinBudget };
    })
    .sort((a, b) => b.score - a.score || a.offer.unitPrice - b.offer.unitPrice);
}

export function batna(scored: ScoredOffer[]): ScoredOffer | undefined {
  return scored.find((s) => s.score > 0);
}