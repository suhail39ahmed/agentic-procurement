/** Optional hard ceiling for sandbox amounts (default $250). Set 0/off/false to disable. */
export function demoMaxUsd(): number | null {
  const raw = process.env.DEMO_MAX_USD;
  if (raw === "0" || raw === "off" || raw === "false") return null;
  if (raw === undefined || raw === "") return 250;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 250;
  return n;
}

export function assertDemoAmount(
  amountUsd: number,
  label = "amount",
): { ok: true } | { ok: false; error: string } {
  const cap = demoMaxUsd();
  if (cap == null) return { ok: true };
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return { ok: false, error: `${label} must be > 0` };
  }
  if (amountUsd > cap) {
    return {
      ok: false,
      error: `${label} $${amountUsd.toFixed(2)} exceeds the configured maximum of $${cap.toFixed(2)}.`,
    };
  }
  return { ok: true };
}
