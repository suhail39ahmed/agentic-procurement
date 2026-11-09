/**
 * Optional hard ceiling for sandbox amounts.
 * Default null (disabled) so POLICY_APPROVAL_THRESHOLD can require approval above $250.
 * Set DEMO_MAX_USD=250 while testing if you want a temporary hard stop.
 */
export function demoMaxUsd(): number | null {
  const raw = process.env.DEMO_MAX_USD;
  if (raw === undefined || raw === "" || raw === "0" || raw === "off" || raw === "false") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
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
