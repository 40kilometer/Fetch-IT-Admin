import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export function awaitingSupportReply(): Prisma.SupportTicketWhereInput {
  return { status: { in: ["OPEN", "IN_PROGRESS"] }, OR: [
    { lastAdminReplyAt: null },
    { lastCustomerMessageAt: { gt: db.supportTicket.fields.lastAdminReplyAt } },
  ] };
}
