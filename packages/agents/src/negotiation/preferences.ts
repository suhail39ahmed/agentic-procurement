import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { getPreferences, updatePreferences } from "db";
import { DEFAULT_WEIGHTS, normalizeWeights, type ScoredOffer, type Weights } from "./scoring";

const STORE_PATH = resolve(process.env.PREFERENCES_PATH ?? ".data/preferences.json");
const LEARNING_RATE = 0.2;

const Store = z.record(
  z.string().min(1).max(64),
  z.object({
    price: z.number().min(0).max(1),
    speed: z.number().min(0).max(1),
    decisions: z.number().int().nonnegative(),
  }),
);
type Store = z.infer<typeof Store>;

function persistEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

async function load(): Promise<Store> {
  try {
    const parsed = Store.safeParse(JSON.parse(await readFile(STORE_PATH, "utf8")));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export async function getLearnedWeights(ownerId: string): Promise<{ weights: Weights; decisions: number }> {
  if (persistEnabled()) {
    const entry = await getPreferences(ownerId);
    return entry ?? { weights: DEFAULT_WEIGHTS, decisions: 0 };
  }
  const entry = (await load())[ownerId];
  return entry
    ? { weights: normalizeWeights(entry), decisions: entry.decisions }
    : { weights: DEFAULT_WEIGHTS, decisions: 0 };
}

export async function recordChoice(ownerId: string, chosen: ScoredOffer): Promise<Weights> {
  const current = await getLearnedWeights(ownerId);
  const signal = chosen.priceScore + chosen.speedScore;
  const observed = signal === 0 ? 0.5 : chosen.priceScore / signal;
  const price = current.weights.price * (1 - LEARNING_RATE) + observed * LEARNING_RATE;
  const next = normalizeWeights({ price, speed: 1 - price });

  if (persistEnabled()) {
    await updatePreferences(ownerId, next, current.decisions + 1);
    return next;
  }

  const store = await load();
  store[ownerId] = { ...next, decisions: current.decisions + 1 };
  await mkdir(dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2));
  return next;
}
