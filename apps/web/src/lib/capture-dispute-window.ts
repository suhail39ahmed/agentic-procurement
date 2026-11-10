/** After capture, Buyer has 48h to raise a PayPal dispute — else order is healthy. */

export const DISPUTE_WINDOW_MS = 48 * 60 * 60 * 1000;

export type CaptureDisputeDecision = "pending" | "disputed" | "healthy" | "expired";

export type CaptureDisputeRecord = {
  negotiationId: string;
  capturedAt: string;
  decision: CaptureDisputeDecision;
  orderId?: string;
  amount?: string;
  captureId?: string;
  brief?: string;
};

const STORAGE_KEY = "procureai.captureDisputeWindows";

function readAll(): Record<string, CaptureDisputeRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CaptureDisputeRecord>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, CaptureDisputeRecord>): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function upsertCaptureWindow(input: Omit<CaptureDisputeRecord, "decision"> & {
  decision?: CaptureDisputeDecision;
}): CaptureDisputeRecord {
  const map = readAll();
  const existing = map[input.negotiationId];
  const next: CaptureDisputeRecord = {
    negotiationId: input.negotiationId,
    capturedAt: input.capturedAt ?? existing?.capturedAt ?? new Date().toISOString(),
    decision: input.decision ?? existing?.decision ?? "pending",
    orderId: input.orderId ?? existing?.orderId,
    amount: input.amount ?? existing?.amount,
    captureId: input.captureId ?? existing?.captureId,
    brief: input.brief ?? existing?.brief,
  };
  map[input.negotiationId] = next;
  writeAll(map);
  return next;
}

export function setCaptureDecision(
  negotiationId: string,
  decision: CaptureDisputeDecision,
): CaptureDisputeRecord | null {
  const map = readAll();
  const existing = map[negotiationId];
  if (!existing) return null;
  const next = { ...existing, decision };
  map[negotiationId] = next;
  writeAll(map);
  return next;
}

export function getCaptureWindow(negotiationId: string): CaptureDisputeRecord | null {
  return readAll()[negotiationId] ?? null;
}

export function listCaptureWindows(): CaptureDisputeRecord[] {
  return Object.values(readAll());
}

/** Apply 48h expiry; returns updated record if decision flipped to expired. */
export function refreshCaptureExpiry(negotiationId: string, now = Date.now()): CaptureDisputeRecord | null {
  const map = readAll();
  const existing = map[negotiationId];
  if (!existing || existing.decision !== "pending") return existing ?? null;
  const capturedMs = Date.parse(existing.capturedAt);
  if (!Number.isFinite(capturedMs)) return existing;
  if (now - capturedMs >= DISPUTE_WINDOW_MS) {
    const next = { ...existing, decision: "expired" as const };
    map[negotiationId] = next;
    writeAll(map);
    return next;
  }
  return existing;
}

export function remainingDisputeMs(capturedAt: string, now = Date.now()): number {
  const capturedMs = Date.parse(capturedAt);
  if (!Number.isFinite(capturedMs)) return 0;
  return Math.max(0, capturedMs + DISPUTE_WINDOW_MS - now);
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return "0h";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const mins = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours >= 48) return "48h";
  if (hours >= 1) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
