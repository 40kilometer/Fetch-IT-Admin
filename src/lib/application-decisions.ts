export type OrientationState = {
  status: string; orientationAt?: Date | string | null; attendedAt?: Date | string | null;
  assessmentPassedAt?: Date | string | null; assessedById?: string | null; assessmentNotes?: string | null;
};
export function orientationDecision(state: OrientationState, now = Date.now()) {
  const at = state.orientationAt ? new Date(state.orientationAt).getTime() : NaN;
  const elapsed = Number.isFinite(at) && at <= now;
  const recorded = !!state.assessedById && !!state.assessmentNotes?.trim();
  const passed = !!state.attendedAt && !!state.assessmentPassedAt;
  const reviewable = ["ORIENTATION_SCHEDULED", "ASSESSED"].includes(state.status);
  return { elapsed, recorded, passed, canApprove: ["ASSESSED", "ACTIVE"].includes(state.status) && elapsed && recorded && passed,
    canReject: reviewable && elapsed && recorded && !passed,
    message: !Number.isFinite(at) ? "Schedule orientation first." : !elapsed ? "Decisions unlock after the scheduled orientation time." : !recorded ? "Record the orientation and assessment result first." : passed ? "Passed: the rider can be approved." : "Failed or absent: the rider can be rejected, or a reasoned force approval can be requested." };
}
export type ForceApprovalRequest = {
  requestId: string; reason: string; requestedById: string; requestedByName: string; requestedByRole: string;
  requestedAt: string; applicationVersion: number; previousStatus: string; vehicleClass: string;
  services: string[]; operatingZone?: unknown;
};
export function forceApprovalRequest(value: unknown): ForceApprovalRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!["requestId", "reason", "requestedById", "requestedByName", "requestedByRole", "requestedAt", "previousStatus", "vehicleClass"].every(k => typeof v[k] === "string" && !!v[k])
    || !Number.isSafeInteger(v.applicationVersion) || !Array.isArray(v.services) || !v.services.length || !v.services.every(s => typeof s === "string")) return null;
  return v as ForceApprovalRequest;
}
export function pendingForceApproval(app: { status: string; version: number; events: { action: string; details?: unknown }[] }) {
  if (app.status !== "FORCE_APPROVAL_PENDING") return null;
  const request = forceApprovalRequest(app.events.find(e => e.action === "FORCE_APPROVAL_REQUESTED")?.details);
  return request?.applicationVersion === app.version ? request : null;
}
