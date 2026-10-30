type Case = { status: string; createdById: string; assignedToId: string | null };
export function canDecideCase(record: Case, actorId: string) {
  return record.status === "AWAITING_ADMIN" && record.createdById !== actorId && record.assignedToId !== actorId;
}
export function caseNextAction(record: Case) {
  if (record.status === "RESOLVED") return "No further action";
  if (record.status === "AWAITING_ADMIN") return "Awaiting Admin decision";
  if (record.status === "APPROVED") return "Carry out approved action";
  if (record.status === "REJECTED") return "Revise recommendation";
  return record.assignedToId ? "Reviewer investigating" : "Assign a reviewer";
}
export function caseViewWhere(view: string, actorId: string) {
  if (view === "unassigned") return { status: { in: ["OPEN", "IN_REVIEW", "REJECTED"] }, assignedToId: null };
  if (view === "decisions") return { status: "AWAITING_ADMIN", createdById: { not: actorId }, OR: [{ assignedToId: null }, { assignedToId: { not: actorId } }] };
  if (view === "team") return { status: { in: ["OPEN", "IN_REVIEW", "REJECTED"] } };
  if (view === "close") return { status: "APPROVED" };
  return null;
}
export const applicationStatusLabel = (value: string) => ({DRAFT:"Draft",SUBMITTED:"Ready for review",IN_REVIEW:"Checklist in review",NEEDS_CORRECTION:"Awaiting rider corrections",RECOMMENDED:"Ready to schedule orientation",ORIENTATION_SCHEDULED:"Orientation scheduled",ASSESSED:"Assessment recorded",DEMO_COMPLETED:"Assessment recorded",ACTIVE:"Services active",REJECTED:"Rejected",FORCE_APPROVAL_PENDING:"Awaiting Admin exception decision"}[value] ?? value.toLowerCase().replaceAll("_", " "));
