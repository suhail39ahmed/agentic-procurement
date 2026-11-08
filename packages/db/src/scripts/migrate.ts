import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { loadRootEnv, requireDatabaseUrl } from "../env";

loadRootEnv();

const url = requireDatabaseUrl();
const here = dirname(fileURLToPath(import.meta.url));
const sqlFile = resolve(here, "../../migrations/0000_initial.sql");

const connectionUrl = new URL(url);
connectionUrl.searchParams.delete("sslmode");

const sql = postgres(connectionUrl.toString(), {
  max: 1,
  ssl: { rejectUnauthorized: true },
  connect_timeout: 10,
  onnotice: () => {},
});

async function main() {
  console.log("Running migrations...");
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;
  const applied = await sql<{ id: string }[]>`SELECT id FROM schema_migrations WHERE id = ${"0000_initial"}`;
  if (applied.length > 0) {
    console.log("Migrations already applied");
    await sql.end();
    return;
  }
  await sql.unsafe(readFileSync(sqlFile, "utf8"));
  await sql`INSERT INTO schema_migrations (id) VALUES (${"0000_initial"})`;
  console.log("Migrations complete");
  await sql.end();
}

main().catch(async (err) => {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  await sql.end({ timeout: 1 }).catch(() => undefined);
  process.exit(1);
});
