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

const MIN_WEIGHT = 0.1;
const MAX_WEIGHT = 0.9;

export function normalizeWeights(weights: Weights): Weights {
  const clamp = (value: number) =>
    Number.isFinite(value) ? Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, value)) : 0.5;
  const price = clamp(weights.price);
  const speed = clamp(weights.speed);
  const share = Math.round((price / (price + speed)) * 100) / 100;
  return { price: share, speed: Math.round((1 - share) * 100) / 100 };
}

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
      const score = Math.round((weights.price * priceScore + weights.speed * speedScore) * 1000) / 1000;
      return { offer, score, priceScore, speedScore, meetsDeadline, withinBudget };
    })
    .sort((a, b) => {
      const aOk = a.withinBudget && a.meetsDeadline ? 1 : 0;
      const bOk = b.withinBudget && b.meetsDeadline ? 1 : 0;
      return bOk - aOk || b.score - a.score || a.offer.unitPrice - b.offer.unitPrice;
    });
}

export function batna(scored: ScoredOffer[]): ScoredOffer | undefined {
  return scored.find((s) => s.withinBudget && s.meetsDeadline);
}