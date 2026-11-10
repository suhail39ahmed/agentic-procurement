import { NextResponse } from "next/server";

export type DemoRole = "buyer" | "owner" | "seller";

export function demoRoleFromRequest(request: Request): DemoRole | null {
  const value = request.headers.get("x-demo-role")?.trim().toLowerCase();
  if (value === "buyer" || value === "owner" || value === "seller") return value;
  return null;
}

/** Supervisor-only: over-$20 spend approve (and other owner-gated money actions). */
export function requireOwnerDemoRole(request: Request): NextResponse | null {
  const role = demoRoleFromRequest(request);
  if (role === "owner") return null;
  return NextResponse.json(
    {
      error: "Supervisor login required for this action. Sign in as Supervisor (supervisor / supervisor), then retry.",
      requiredRole: "supervisor",
      currentRole: role ?? "none",
    },
    { status: 403 },
  );
}

/** Seller-only: accept_dispute_claim on a buyer-raised claim. */
export function requireSellerDemoRole(request: Request): NextResponse | null {
  const role = demoRoleFromRequest(request);
  if (role === "seller") return null;
  return NextResponse.json(
    {
      error: "Seller login required to accept a dispute claim. Sign in as Seller (seller / seller), then retry.",
      requiredRole: "seller",
      currentRole: role ?? "none",
    },
    { status: 403 },
  );
}
