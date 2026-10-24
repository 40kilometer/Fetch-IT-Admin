import type { Prisma } from "@prisma/client";
export type SearchParams = Record<string, string | string[] | undefined>;
export const queryValue = (query: SearchParams, key: string) => typeof query[key] === "string" ? query[key] as string : "";
export function queryLink(path: string, filters: Record<string, string | number | undefined>, page = 1) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") params.set(key, String(value));
  if (page > 1) params.set("page", String(page)); else params.delete("page");
  return path + (params.size ? `?${params}` : "");
}
export function accountWhere(role: "CUSTOMER" | "RIDER", q: string, status: string): Prisma.UserWhereInput {
  return { role, ...(status === "restricted" ? { isBanned: true } : status === "active" ? { isBanned: false } : {}),
    ...(role === "RIDER" && ["online", "offline"].includes(status) ? { isBanned: false, ...(status === "online" ? { riderPresence: { is: { isOnline: true } } } : { OR: [{ riderPresence: { is: null } }, { riderPresence: { is: { isOnline: false } } }] }) } : {}),
    ...(q ? { AND: [{ OR: ["name", "email", "phone"].map(key => ({ [key]: { contains: q.trim().slice(0, 100), mode: "insensitive" } })) }] } : {}) };
}
export function humanize(value: string) {
  const labels: Record<string, string> = { AWAITING_ADMIN: "Awaiting approval", IN_REVIEW: "In review", IN_PROGRESS: "In progress", REJECTED: "Returned for review", ESCALATION: "Support escalation", FINANCE: "Finance", SAFETY: "Safety" };
  return labels[value] ?? value.toLowerCase().replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
}
export function caseActions(record: { kind: string; status: string; assignedToId: string | null; createdById: string }, actor: { id: string; operations: boolean; managesSupport: boolean }) {
  const manages = actor.operations || record.kind === "ESCALATION" && actor.managesSupport;
  const editable = record.status !== "RESOLVED", owns = record.assignedToId === actor.id;
  return { manages, claim: editable && !record.assignedToId, assign: editable && manages, note: editable && (owns || manages),
    recommend: (owns || manages) && ["OPEN", "IN_REVIEW", "REJECTED"].includes(record.status),
    decide: actor.operations && record.status === "AWAITING_ADMIN" && record.createdById !== actor.id && !owns,
    close: manages && ["APPROVED", "IN_REVIEW", "OPEN"].includes(record.status) && (record.kind === "ESCALATION" || record.status === "APPROVED") };
}
export function priorityWindows(groups: { priority: string; count: number }[], skip: number, take: number) {
  const rank = ["URGENT", "HIGH", "NORMAL", "LOW"];
  const sorted = [...groups].sort((a, b) => (rank.includes(a.priority) ? rank.indexOf(a.priority) : 4) - (rank.includes(b.priority) ? rank.indexOf(b.priority) : 4) || a.priority.localeCompare(b.priority));
  const windows: { priority: string; skip: number; take: number }[] = [];
  for (const group of sorted) {
    if (skip >= group.count) { skip -= group.count; continue; }
    const size = Math.min(group.count - skip, take);
    if (size) windows.push({ priority: group.priority, skip, take: size });
    skip = 0; take -= size; if (!take) break;
  }
  return windows;
}
export function overviewPeriod(value: string, now = new Date()) {
  const days = value === "7" ? 7 : value === "30" ? 30 : 1;
  const today = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const since = new Date(new Date(`${today}T00:00:00+08:00`).getTime() - (days - 1) * 86400000);
  return { days, today, since, until: now, label: days === 1 ? "Today" : `Last ${days} days` };
}
