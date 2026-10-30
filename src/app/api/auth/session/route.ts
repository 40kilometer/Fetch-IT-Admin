import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-access";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const staff = await currentStaff();
    if (!staff) return NextResponse.json({ error: "Sign in again." }, { status: 401, headers });
    return NextResponse.json({ id: staff.id, role: staff.role, expiresAt:staff.sessionExpiresAt }, { headers });
  } catch {
    return NextResponse.json({ error: "Session check temporarily unavailable." }, { status: 503, headers });
  }
}
