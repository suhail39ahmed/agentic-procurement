/** Exact dollar <-> integer-cent conversion. Domain money stays in dollars. */

export function toCents(dollars: number): number {
  if (!Number.isFinite(dollars)) throw new Error("Invalid dollar amount");
  return Math.round(dollars * 100);
}

export function fromCents(cents: number): number {
  if (!Number.isInteger(cents)) throw new Error("Cent amount must be an integer");
  return cents / 100;
}

export function dollarsToFixed(dollars: number): string {
  return fromCents(toCents(dollars)).toFixed(2);
}
