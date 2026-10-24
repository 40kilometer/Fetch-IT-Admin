import { withRequestLog } from "@/lib/request-guard";
import { NextRequest, NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-access";
import { supportScope,hasPermission } from "@/lib/staff-policy";
import { db } from "@/lib/db";
import { enqueueSupportNotification } from "@/lib/customer-notifications";
async function handlePATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await currentStaff('support');
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => null);
    if (!body || !["OPEN", "IN_PROGRESS", "RESOLVED"].includes(body.status) || typeof body.reply !== "string" || body.reply.length > 2000 || (body.priority !== undefined && !["LOW","NORMAL","HIGH","URGENT"].includes(body.priority))) return NextResponse.json({ error: "Choose a valid status, priority, and reply of up to 2,000 characters." }, { status: 400 });
    const { id } = await params;
    const ticket = await db.supportTicket.findFirst({ where: { id,...supportScope(admin) }, include: { messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 } } });
    if (!ticket) return NextResponse.json({ error: "Request not found." }, { status: 404 });
    const reply = body.reply.trim();
    if (body.status === "RESOLVED" && !reply && (!ticket.lastAdminReplyAt || ticket.lastCustomerMessageAt > ticket.lastAdminReplyAt)) return NextResponse.json({ error: "Reply to the customer's latest message before resolving this request." }, { status: 400 });
    if (body.updatedAt !== undefined && (typeof body.updatedAt !== "string" || body.updatedAt !== ticket.updatedAt.toISOString())) return NextResponse.json({ error: "This request has changed. Refresh before saving." }, { status: 409 });
    const assignee = body.assignedAdminId === undefined ? ticket.assignedAdminId : body.assignedAdminId || null;
    if(!hasPermission(admin.role,'support.manage') && (assignee!==admin.id || ticket.assignedAdminId!==null&&ticket.assignedAdminId!==admin.id)) return NextResponse.json({error:'You may claim an unassigned ticket or update your own ticket.'},{status:403});
    if (assignee !== null && typeof assignee !== "string") return NextResponse.json({ error: "Choose an active admin." }, { status: 400 });
    if (assignee) {
      const assigned = await db.user.findUnique({ where: { id: assignee }, select: { role: true, isBanned: true } });
      if (!assigned || !['ADMIN','SUPPORT','SUPPORT_SUPERVISOR'].includes(assigned.role) || assigned.isBanned) return NextResponse.json({ error: "Choose an active support team member." }, { status: 400 });
    }
    const result = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "SupportTicket" WHERE "id" = ${id} FOR UPDATE`;
      const changed = await tx.supportTicket.updateMany({ where: { id, updatedAt: ticket.updatedAt }, data: { status: body.status, priority: body.priority ?? ticket.priority, assignedAdminId: assignee } });
      if (!changed.count) return null;
      if (reply) {
        const createdAt = new Date(Math.max(Date.now(), ticket.lastCustomerMessageAt.getTime() + 1, (ticket.lastAdminReplyAt?.getTime() ?? 0) + 1));
        const message = await tx.supportMessage.create({ data: { ticketId: id, authorId: admin.id, authorName: admin.name, authorRole: admin.role, body: reply, createdAt } });
        await enqueueSupportNotification(tx, message);
        await tx.supportTicket.update({ where: { id }, data: { lastAdminReplyAt: message.createdAt } });
      }
      await tx.adminAudit.create({ data: { actorId: admin.id, actorName: admin.name, action: "SUPPORT_UPDATED", entityType: "SUPPORT", entityId: id, details: { status: body.status, priority: body.priority ?? ticket.priority, assignedAdminId: assignee, replyAdded: !!reply } } });
      return tx.supportTicket.findUnique({ where: { id } });
    });
    return result ? NextResponse.json({ ticket: result }) : NextResponse.json({ error: "This request has changed. Refresh before saving." }, { status: 409 });
  } catch { return NextResponse.json({ error: "Couldn’t update the request. Please retry." }, { status: 503 }); }
}

export const PATCH = withRequestLog("admin:support/[id]:PATCH", handlePATCH);
