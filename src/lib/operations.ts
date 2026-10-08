import type { Prisma, BookingStatus, BookingType, PaymentStatus } from "@prisma/client";

export const ACTIVE_STATUSES: BookingStatus[] = ["PENDING", "MATCHED", "ACCEPTED", "PICKED_UP", "IN_TRANSIT"];
const statuses: BookingStatus[] = [...ACTIVE_STATUSES, "DELIVERED", "CANCELLED"];
export type BookingFilters = { q?: string; status?: string; paymentStatus?: string; type?: string; from?: string; to?: string; attention?: string; page?: string };
export const PAGE_SIZE = 25;
export function normalizeFilters(input: Record<string, unknown>): BookingFilters {
  return Object.fromEntries(["q", "status", "paymentStatus", "type", "from", "to", "attention", "page"].map(key => [key, typeof input[key] === "string" ? input[key] : undefined]));
}
function day(value: string, end: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error("Choose valid dates.");
  return new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}+08:00`);
}
export function dateBounds(start?: string, end?: string) {
  const from = start ? day(start, false) : undefined;
  const to = end ? day(end, true) : undefined;
  if (from && to && from > to) throw new Error("The from date must be before the to date.");
  return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
}
export function bookingWhere(filters: BookingFilters, now = new Date()): Prisma.BookingWhereInput {
  const q = filters.q?.trim().slice(0, 100);
  const dates = dateBounds(filters.from, filters.to);
  const attention: Prisma.BookingWhereInput | undefined = filters.attention === "unassigned"
    ? { riderId: null, status: { in: ACTIVE_STATUSES }, createdAt: { lte: new Date(now.getTime() - 5 * 60000) }, OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] }
    : filters.attention === "stalled" ? { riderId: { not: null }, status: { in: ["MATCHED", "ACCEPTED", "PICKED_UP", "IN_TRANSIT"] }, updatedAt: { lte: new Date(now.getTime() - 30 * 60000) }, OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] } : undefined;
  return { AND: [
    ...(attention ? [attention] : []),
    ...(filters.status && statuses.includes(filters.status as BookingStatus) ? [{ status: filters.status as BookingStatus }] : []),
    ...(filters.paymentStatus && ["UNPAID", "PENDING", "PAID", "REFUNDED", "FAILED"].includes(filters.paymentStatus) ? [{ paymentStatus: filters.paymentStatus as PaymentStatus }] : []),
    ...(filters.type === "DELIVERY" || filters.type === "RIDE" ? [{ type: filters.type as BookingType }] : []),
    ...(dates.gte || dates.lte ? [{ createdAt: dates }] : []),
    ...(q ? [{ OR: [{ refCode: { contains: q, mode: "insensitive" as const } }, { pickupLabel: { contains: q, mode: "insensitive" as const } }, { dropoffLabel: { contains: q, mode: "insensitive" as const } }] }] : []),
  ] };
}
export function pageNumber(value?: string) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
}
export function bookingQuery(filters: BookingFilters, page?: number) {
  const query = new URLSearchParams();
  for (const key of ["q", "status", "paymentStatus", "type", "from", "to", "attention"] as const) if (filters[key]) query.set(key, filters[key]!);
  if (page && page > 1) query.set("page", String(page));
  return query.toString();
}
