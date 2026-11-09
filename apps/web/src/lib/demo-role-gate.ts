import { NextResponse } from "next/server";

export type DemoRole = "buyer" | "owner";

export function demoRoleFromRequest(request: Request): DemoRole | null {
  const value = request.headers.get("x-demo-role")?.trim().toLowerCase();
  if (value === "buyer" || value === "owner") return value;
  return null;
}

/** Supervisor-only actions (over-$20 spend approve, dispute accept). Capture is allowed for Buyer too. */
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
