export function assertSandboxOnly(): void {
  const env = (process.env.PAYPAL_ENV ?? "").trim().toLowerCase();
  if (env !== "sandbox") {
    throw new Error(
      `Refusing to start: PAYPAL_ENV must be "sandbox" (got "${env || "unset"}"). Live payments are disabled.`,
    );
  }
}

export function assertMandateSecret(): void {
  const secret = process.env.MANDATE_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error("Refusing to start: MANDATE_SECRET must be at least 32 characters.");
  }
}
