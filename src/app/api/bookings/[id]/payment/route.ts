import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin-access";
import { db } from "@/lib/db";
import { PaymentError, reviewPayment } from "@/lib/payments";
import { withRequestLog } from "@/lib/request-guard";
async function patch(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Payment details required." }, { status: 400 });
  try {
    await reviewPayment(db, (await params).id, { uid: admin.id, name: admin.name, role: "ADMIN" }, body);
    return NextResponse.json({ message: "Payment record updated." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PaymentError ? error.message : "Payment update unavailable. Please retry." }, { status: error instanceof PaymentError ? error.status : 503 });
  }
}
export const PATCH = withRequestLog("admin:payment:PATCH", patch);
