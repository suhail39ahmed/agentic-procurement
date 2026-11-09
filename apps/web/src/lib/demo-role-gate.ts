import { NextResponse } from "next/server";

export type DemoRole = "buyer" | "owner";

export function demoRoleFromRequest(request: Request): DemoRole | null {
  const value = request.headers.get("x-demo-role")?.trim().toLowerCase();
  if (value === "buyer" || value === "owner") return value;
  return null;
}

/** Owner-only actions (approve spend, capture, dispute accept). */
export function requireOwnerDemoRole(request: Request): NextResponse | null {
  const role = demoRoleFromRequest(request);
  if (role === "owner") return null;
  return NextResponse.json(
    {
      error: "Owner login required for this action. Sign in as Owner (owner / owner), then retry.",
      requiredRole: "owner",
      currentRole: role ?? "none",
    },
    { status: 403 },
  );
}
