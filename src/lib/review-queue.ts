export const REVIEW_STATUSES = ["OPEN", "IN_REVIEW", "RESOLVED"] as const;
export const REVIEW_PRIORITIES = ["URGENT", "HIGH", "NORMAL", "LOW"] as const;
export const reviewLabel = (value: string) => ({ OPEN: "Open", IN_REVIEW: "In review", IN_PROGRESS: "In review", RESOLVED: "Resolved", ESCALATION: "Supervisor help", SAFETY: "Safety Review", FINANCE: "Admin financial review" }[value] ?? value.toLowerCase().replaceAll("_", " ").replace(/^./, c => c.toUpperCase()));
// Approval stages remain intact; they are all ongoing reviews in the queue.
export function reviewStatus(status: string) {
  return status === "OPEN" ? "OPEN" : status === "RESOLVED" ? "RESOLVED" : "IN_REVIEW";
}
export function reviewStatusWhere(status: string) {
  return status === "IN_REVIEW" ? { in: ["IN_REVIEW", "AWAITING_ADMIN", "APPROVED", "REJECTED"] } : status;
}
export function readQueue(query: Record<string, string | string[] | undefined>, priorities: boolean) {
  const value = (key: string) => typeof query[key] === "string" ? query[key] as string : "";
  return {
    q: value("q").trim().slice(0, 100),
    status: ["OPEN", "IN_REVIEW", "IN_PROGRESS", "RESOLVED", "AWAITING_ADMIN", "APPROVED", "REJECTED"].includes(value("status")) ? reviewStatus(value("status")) : "OPEN",
    priority: priorities && (REVIEW_PRIORITIES as readonly string[]).includes(value("priority")) ? value("priority") : "",
    sort: value("sort") === "newest" ? "newest" : "oldest",
  };
}
