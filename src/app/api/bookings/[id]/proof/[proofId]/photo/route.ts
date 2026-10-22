import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin-access";
import { deliveryPhotoResponse } from "@/lib/epod-photo-response";
import { withRequestLog } from "@/lib/request-guard";

export const runtime = "nodejs";
async function handleGET(_req: NextRequest, { params }: { params: Promise<{ id: string; proofId: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Please sign in with an authorized account." }, { status: 403 });
  const { id, proofId } = await params;
  return deliveryPhotoResponse(id, proofId, {});
}
export const GET = withRequestLog("admin:epod-photo:GET", handleGET);
