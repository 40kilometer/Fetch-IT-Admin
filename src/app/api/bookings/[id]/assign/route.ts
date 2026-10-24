import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin-access";
import { db } from "@/lib/db";
import { assignRider, DispatchError } from "@/lib/dispatch";
import { withRequestLog } from "@/lib/request-guard";
async function post(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  try {
    await assignRider(db, (await params).id, { uid: admin.id, name: admin.name, role: admin.role === "SUPERADMIN" ? "SUPERADMIN" : "ADMIN" }, body?.reason, body?.riderId);
    return NextResponse.json({ message: "Rider offered this booking. Acceptance is required before the configured offer expires." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof DispatchError ? error.message : "Assignment unavailable. Please retry." }, { status: error instanceof DispatchError ? error.status : 503 });
  }
}
export const POST = withRequestLog("admin:assignment:POST", post);
