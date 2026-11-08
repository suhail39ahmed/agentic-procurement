import { eq, asc } from "drizzle-orm";
import { getDatabase } from "../client";
import { sellers } from "../schema";
import { fromCents, toCents } from "../money";

export type SellerConfig = {
  id: string;
  name: string;
  floorPrice: number;
  listPrice: number;
  stock: number;
  leadTimeDays: number;
  persona: string;
};

function toDomain(row: typeof sellers.$inferSelect): SellerConfig {
  return {
    id: row.id,
    name: row.name,
    floorPrice: fromCents(row.floorPrice),
    listPrice: fromCents(row.listPrice),
    stock: row.stock,
    leadTimeDays: row.leadTimeDays,
    persona: row.persona,
  };
}

export async function getSeller(id: string): Promise<SellerConfig | undefined> {
  const db = getDatabase();
  const [row] = await db.select().from(sellers).where(eq(sellers.id, id)).limit(1);
  return row ? toDomain(row) : undefined;
}

export async function listSellers(): Promise<SellerConfig[]> {
  const db = getDatabase();
  const rows = await db.select().from(sellers).orderBy(asc(sellers.id));
  return rows.map(toDomain);
}

export async function upsertSeller(seller: SellerConfig): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db
    .insert(sellers)
    .values({
      id: seller.id,
      name: seller.name,
      floorPrice: toCents(seller.floorPrice),
      listPrice: toCents(seller.listPrice),
      stock: seller.stock,
      leadTimeDays: seller.leadTimeDays,
      persona: seller.persona,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: sellers.id,
      set: {
        name: seller.name,
        floorPrice: toCents(seller.floorPrice),
        listPrice: toCents(seller.listPrice),
        stock: seller.stock,
        leadTimeDays: seller.leadTimeDays,
        persona: seller.persona,
        updatedAt: now,
      },
    });
}
