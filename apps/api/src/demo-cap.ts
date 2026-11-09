/** Hackathon/demo spend guard — keep sandbox money tiny (default $2). */
export function demoMaxUsd(): number | null {
  const raw = process.env.DEMO_MAX_USD;
  if (raw === "0" || raw === "off" || raw === "false") return null;
  if (raw === undefined || raw === "") return 2;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 2;
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
      error: `${label} $${amountUsd.toFixed(2)} exceeds DEMO_MAX_USD=$${cap.toFixed(2)}. Use a smaller sandbox amount.`,
    };
  }
  return { ok: true };
}
