import type { Prisma } from '@prisma/client';
import { StaffError, text } from './staff-http';
import { canCompleteSafetyAlert } from './safety-alert';

export async function completeSafetyAlert(tx: Prisma.TransactionClient, id: string, actor: { id: string; name: string; role: string }, body: Record<string, unknown>) {
  if (actor.role !== 'ADMIN') throw new StaffError('Only Admin can mark a safety alert as done.', 403);
  await tx.$queryRaw`SELECT "id" FROM "WorkflowCase" WHERE "id"=${id} FOR UPDATE`;
  const record = await tx.workflowCase.findUnique({ where: { id } });
  if (!record) throw new StaffError('Safety alert unavailable.', 404);
  if (body.version !== record.version) throw new StaffError('This alert changed. Refresh and review it before marking it as done.', 409);
  if (!canCompleteSafetyAlert(actor.role, record)) throw new StaffError('Only an active passenger safety alert can be marked as done here.', 409);
  const reason = text(body.reason, 500);
  if (!record.ticketId) throw new StaffError('This alert has no linked customer request. Correct the link before completing it.', 409);
  await tx.$queryRaw`SELECT "id" FROM "SupportTicket" WHERE "id"=${record.ticketId} FOR UPDATE`;
  const ticket = await tx.supportTicket.findUnique({ where: { id: record.ticketId } });
  if (!ticket?.isEmergency || record.subjectUserId && ticket.customerId !== record.subjectUserId || record.bookingId !== ticket.bookingId) {
    throw new StaffError('The linked safety request does not match this alert. Correct the link before completing it.', 409);
  }
  const completedAt = new Date();
  if (ticket.status !== 'RESOLVED') {
    await tx.supportTicket.update({ where: { id: ticket.id }, data: { status: 'RESOLVED' } });
    await tx.adminAudit.create({ data: { actorId: actor.id, actorName: actor.name, action: 'SUPPORT_RESOLVE', entityType: 'SUPPORT', entityId: ticket.id,
      details: { from: ticket.status, to: 'RESOLVED', reason, caseId: id, source: 'SAFETY_ALERT_DONE' } } });
  }
  const updated = await tx.workflowCase.update({ where: { id }, data: { status: 'RESOLVED', version: { increment: 1 },
    assignedToId: record.assignedToId ?? actor.id, acknowledgedAt: record.acknowledgedAt ?? completedAt } });
  await tx.workflowNote.create({ data: { caseId: id, authorId: actor.id, authorName: actor.name, body: `Safety alert marked as done.\nResolution: ${reason}` } });
  await tx.adminAudit.create({ data: { actorId: actor.id, actorName: actor.name, action: 'CASE_ALERT_DONE', entityType: 'CASE', entityId: id,
    details: { from: record.status, to: updated.status, reason, ticketId: ticket.id, previousAssignedToId: record.assignedToId,
      assignedToId: updated.assignedToId, completedAt: completedAt.toISOString(), internal: true } } });
  return { message: 'Safety alert marked as done. Resolution saved; the linked safety request is closed. No customer message was sent.' };
}
