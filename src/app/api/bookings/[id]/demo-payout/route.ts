import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin-access";
import { db } from "@/lib/db";
import { recordDemoPayout } from "@/lib/demo-payments";
import { PaymentError } from "@/lib/payments";
import { withRequestLog } from "@/lib/request-guard";
async function post(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Demo payout details required." }, { status: 400 });
  try {
    await recordDemoPayout(db, (await params).id, { uid: admin.id, name: admin.name, role: admin.role === "SUPERADMIN" ? "SUPERADMIN" : "ADMIN" }, body);
    return NextResponse.json({ message: "Demo payout recorded. No real money moved." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PaymentError ? error.message : "Demo payout unavailable. Please retry." }, { status: error instanceof PaymentError ? error.status : 503 });
  }
}
export const POST = withRequestLog("admin:demo-payout:POST", post);
