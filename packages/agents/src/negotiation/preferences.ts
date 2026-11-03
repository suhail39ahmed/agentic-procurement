import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { DEFAULT_WEIGHTS, normalizeWeights, type ScoredOffer, type Weights } from "./scoring";

const STORE_PATH = resolve(process.env.PREFERENCES_PATH ?? ".data/preferences.json");
const LEARNING_RATE = 0.2;

const Store = z.record(
  z.string().min(1).max(64),
  z.object({
    price: z.number().min(0).max(1),
    speed: z.number().min(0).max(1),
    decisions: z.number().int().nonnegative(),
  })
);
type Store = z.infer<typeof Store>;

async function load(): Promise<Store> {
  try {
    const parsed = Store.safeParse(JSON.parse(await readFile(STORE_PATH, "utf8")));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export async function getLearnedWeights(ownerId: string): Promise<{ weights: Weights; decisions: number }> {
  const entry = (await load())[ownerId];
  return entry
    ? { weights: normalizeWeights(entry), decisions: entry.decisions }
    : { weights: DEFAULT_WEIGHTS, decisions: 0 };
}

export async function recordChoice(ownerId: string, chosen: ScoredOffer): Promise<Weights> {
  const store = await load();
  const current = store[ownerId] ?? { ...DEFAULT_WEIGHTS, decisions: 0 };

  const signal = chosen.priceScore + chosen.speedScore;
  const observed = signal === 0 ? 0.5 : chosen.priceScore / signal;
  const price = current.price * (1 - LEARNING_RATE) + observed * LEARNING_RATE;
  const next = normalizeWeights({ price, speed: 1 - price });

  store[ownerId] = { ...next, decisions: current.decisions + 1 };
  await mkdir(dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2));
  return next;
}