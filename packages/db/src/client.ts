import { AsyncLocalStorage } from "node:async_hooks";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { requireDatabaseUrl } from "./env";

type Db = PostgresJsDatabase<typeof schema>;

const txContext = new AsyncLocalStorage<Db>();

let sql: ReturnType<typeof postgres> | null = null;
let root: Db | null = null;

export function getDatabase(): Db {
  const tx = txContext.getStore();
  if (tx) return tx;
  if (!root) {
    const connectionUrl = new URL(requireDatabaseUrl());
    connectionUrl.searchParams.delete("sslmode");

    sql = postgres(connectionUrl.toString(), {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 15,
      ssl: { rejectUnauthorized: true },
    });
    root = drizzle(sql, { schema });
  }
  return root;
}

export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const db = getDatabase();
  return db.transaction(async (tx) => txContext.run(tx as unknown as Db, fn));
}

export async function closeDatabase(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
    root = null;
  }
}
