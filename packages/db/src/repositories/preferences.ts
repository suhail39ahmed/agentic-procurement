import { eq } from "drizzle-orm";
import { getDatabase } from "../client";
import { preferences } from "../schema";

const WEIGHT_SCALE = 1000;

export type Weights = {
  price: number;
  speed: number;
};

export async function getPreferences(ownerId: string): Promise<{ weights: Weights; decisions: number } | undefined> {
  const db = getDatabase();
  const [pref] = await db.select().from(preferences).where(eq(preferences.ownerId, ownerId)).limit(1);
  if (!pref) return undefined;
  return {
    weights: {
      price: pref.priceWeight / WEIGHT_SCALE,
      speed: pref.speedWeight / WEIGHT_SCALE,
    },
    decisions: pref.decisions,
  };
}

export async function updatePreferences(ownerId: string, weights: Weights, decisions: number): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db
    .insert(preferences)
    .values({
      ownerId,
      priceWeight: Math.round(weights.price * WEIGHT_SCALE),
      speedWeight: Math.round(weights.speed * WEIGHT_SCALE),
      decisions,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: preferences.ownerId,
      set: {
        priceWeight: Math.round(weights.price * WEIGHT_SCALE),
        speedWeight: Math.round(weights.speed * WEIGHT_SCALE),
        decisions,
        updatedAt: now,
      },
    });
}
