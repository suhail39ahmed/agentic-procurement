import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

/** Durable-enough demo store: JSON Lines file, unique by PayPal event id (webhook_events.id).
 *  Replaced by Postgres table webhook_events in issue #2/#27. */
export interface StoredEvent { id: string; transmission_id: string; event_type: string; resource_id?: string; received_at: string; payload: unknown }

export class WebhookStore {
  private seen = new Set<string>();
  constructor(private file = process.env.WEBHOOK_STORE_FILE ?? "data/webhook_events.jsonl") {
    mkdirSync(dirname(this.file), { recursive: true });
    if (existsSync(this.file)) for (const line of readFileSync(this.file, "utf8").split("\n")) if (line) this.seen.add(JSON.parse(line).id);
  }
  has(id: string) { return this.seen.has(id); }
  /** Returns false if the event was already stored (duplicate delivery / retry). */
  add(e: StoredEvent): boolean {
    if (this.seen.has(e.id)) return false;
    this.seen.add(e.id); appendFileSync(this.file, JSON.stringify(e) + "\n"); return true;
  }
  get size() { return this.seen.size; }
}
