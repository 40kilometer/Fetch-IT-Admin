import { Prisma, type AdminAudit } from "@prisma/client";
import { db } from "./db";
import type { StaffTeam } from "./staff-teams";
import { dateBounds, PAGE_SIZE, pageNumber } from "./operations";

export function teamAuditScope(team: StaffTeam) {
  const domains = [
    Prisma.sql`EXISTS (SELECT 1 FROM "User" u WHERE u.id = a."actorId" AND u.role::text IN (${Prisma.join([...team.roles])}))`,
    Prisma.sql`(a."entityType" = 'CASE' AND EXISTS (SELECT 1 FROM "WorkflowCase" c WHERE c.id = a."entityId" AND c.kind = ${team.caseKind}))`,
    Prisma.sql`(a."entityType" = 'RESOURCE' AND a.details->>'team' = ${team.slug})`,
  ];
  if (team.slug === "customer-support") domains.push(Prisma.sql`a."entityType" = 'SUPPORT'`, Prisma.sql`(a."entityType" = 'RESOURCE' AND a.details->>'kind' IN ('KNOWLEDGE','TEMPLATE'))`);
  if (team.slug === "finance") domains.push(Prisma.sql`a.action = 'PAYMENT_UPDATED'`);
  if (team.slug === "safety") domains.push(Prisma.sql`a."entityType" = 'RIDER_APPLICATION'`, Prisma.sql`(a."entityType" = 'RESOURCE' AND a.details->>'kind' = 'SAFETY_GUIDE')`);
  return Prisma.sql`(${Prisma.join(domains, " OR ")})`;
}

export async function readTeamAudit(team: StaffTeam, filters: { q: string; from: string; to: string; page: string }) {
  const dates = dateBounds(filters.from, filters.to), conditions = [teamAuditScope(team)];
  if (filters.q) conditions.push(Prisma.sql`(a."actorName" ILIKE ${"%" + filters.q + "%"} OR a."entityId" ILIKE ${"%" + filters.q + "%"} OR a.action ILIKE ${"%" + filters.q + "%"})`);
  if (dates.gte) conditions.push(Prisma.sql`a."createdAt" >= ${dates.gte}`);
  if (dates.lte) conditions.push(Prisma.sql`a."createdAt" <= ${dates.lte}`);
  const where = Prisma.join(conditions, " AND ");
  const [count] = await db.$queryRaw<{ total: number }[]>(Prisma.sql`SELECT count(*)::integer AS total FROM "AdminAudit" a WHERE ${where}`);
  const total = count.total, pages = Math.max(1, Math.ceil(total / PAGE_SIZE)), page = Math.min(pageNumber(filters.page), pages);
  const events = await db.$queryRaw<AdminAudit[]>(Prisma.sql`SELECT a.* FROM "AdminAudit" a WHERE ${where} ORDER BY a."createdAt" DESC, a.id DESC LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`);
  return { events, total, pages, page };
}
