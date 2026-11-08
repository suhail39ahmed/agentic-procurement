import "server-only";

export function requireLocalAuditViewer() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Audit viewer requires authentication before deployment");
  }
}