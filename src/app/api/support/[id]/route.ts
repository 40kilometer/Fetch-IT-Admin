import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/session";
import { db } from "@/lib/db";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const admin = await db.user.findUnique({ where: { id: session.uid } });
    if (!admin || admin.role !== "ADMIN" || admin.isBanned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json().catch(() => null);
    if (!body || !["OPEN", "IN_PROGRESS", "RESOLVED"].includes(body.status) || typeof body.reply !== "string" || body.reply.length > 2000) return NextResponse.json({ error: "Choose a status and a reply of up to 2,000 characters." }, { status: 400 });
    if (body.status === "RESOLVED" && !body.reply.trim()) return NextResponse.json({ error: "Add a reply before resolving this request." }, { status: 400 });
    const { id } = await params;
    if (!await db.supportTicket.findUnique({ where: { id } })) return NextResponse.json({ error: "Request not found." }, { status: 404 });
    const ticket = await db.supportTicket.update({ where: { id }, data: { status: body.status, adminReply: body.reply.trim() || null } });
    return NextResponse.json({ ticket });
  } catch { return NextResponse.json({ error: "Couldn’t update the request. Please retry." }, { status: 503 }); }
}
