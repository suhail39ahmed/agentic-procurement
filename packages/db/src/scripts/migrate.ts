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

  for (const id of [
    "0000_initial",
    "0001_audit_records",
    "0002_negotiations",
    "0003_ap_toolkit",
    "0004_stretch",
  ]) {
    const changed = await sql.begin(async (tx) => {
      await tx`LOCK TABLE schema_migrations IN EXCLUSIVE MODE`;
      const applied = await tx<{ id: string }[]>`
        SELECT id FROM schema_migrations WHERE id = ${id}
      `;
      if (applied.length > 0) return false;

      const file = resolve(here, `../../migrations/${id}.sql`);
      await tx.unsafe(readFileSync(file, "utf8"));
      await tx`INSERT INTO schema_migrations (id) VALUES (${id})`;
      return true;
    });
    console.log(`${id}: ${changed ? "applied" : "already applied"}`);
  }

  await sql.end();
  console.log("Migrations complete");
}

main().catch(async (err) => {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  await sql.end({ timeout: 1 }).catch(() => undefined);
  process.exit(1);
});
