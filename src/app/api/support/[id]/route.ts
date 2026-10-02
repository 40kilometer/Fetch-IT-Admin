import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin-access";
import { db } from "@/lib/db";
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await currentAdmin();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => null);
    if (!body || !["OPEN", "IN_PROGRESS", "RESOLVED"].includes(body.status) || typeof body.reply !== "string" || body.reply.length > 2000 || (body.priority !== undefined && !["LOW","NORMAL","HIGH","URGENT"].includes(body.priority))) return NextResponse.json({ error: "Choose a valid status, priority, and reply of up to 2,000 characters." }, { status: 400 });
    const { id } = await params;
    const ticket = await db.supportTicket.findUnique({ where: { id } });
    if (!ticket) return NextResponse.json({ error: "Request not found." }, { status: 404 });
    const reply = body.reply.trim();
    if (body.status === "RESOLVED" && !reply && !ticket.adminReply) return NextResponse.json({ error: "Add a reply before resolving this request." }, { status: 400 });
    if (body.updatedAt !== undefined && (typeof body.updatedAt !== "string" || body.updatedAt !== ticket.updatedAt.toISOString())) return NextResponse.json({ error: "This request has changed. Refresh before saving." }, { status: 409 });
    const assignee = body.assignedAdminId === undefined ? ticket.assignedAdminId : body.assignedAdminId || null;
    if (assignee !== null && typeof assignee !== "string") return NextResponse.json({ error: "Choose an active admin." }, { status: 400 });
    if (assignee) {
      const assigned = await db.user.findUnique({ where: { id: assignee }, select: { role: true, isBanned: true } });
      if (assigned?.role !== "ADMIN" || assigned.isBanned) return NextResponse.json({ error: "Choose an active admin." }, { status: 400 });
    }
    const result = await db.$transaction(async tx => {
      const changed = await tx.supportTicket.updateMany({ where: { id, updatedAt: ticket.updatedAt }, data: { status: body.status, priority: body.priority ?? ticket.priority, assignedAdminId: assignee, ...(reply ? { adminReply: reply } : {}) } });
      if (!changed.count) return null;
      if (reply && reply !== ticket.adminReply) {
        if (ticket.adminReply && !await tx.supportMessage.count({ where: { ticketId: id } })) await tx.supportMessage.create({ data: { ticketId: id, authorId: "legacy", authorName: "Previous admin", body: ticket.adminReply, createdAt: ticket.updatedAt } });
        await tx.supportMessage.create({ data: { ticketId: id, authorId: admin.id, authorName: admin.name, body: reply } });
      }
      await tx.adminAudit.create({ data: { actorId: admin.id, actorName: admin.name, action: "SUPPORT_UPDATED", entityType: "SUPPORT", entityId: id, details: { status: body.status, priority: body.priority ?? ticket.priority, assignedAdminId: assignee, replyAdded: !!reply && reply !== ticket.adminReply } } });
      return tx.supportTicket.findUnique({ where: { id } });
    });
    return result ? NextResponse.json({ ticket: result }) : NextResponse.json({ error: "This request has changed. Refresh before saving." }, { status: 409 });
  } catch { return NextResponse.json({ error: "Couldn’t update the request. Please retry." }, { status: 503 }); }
}
