"use client";
import { useEffect, useState } from "react";
import { orientationDecision, pendingForceApproval, type OrientationState } from "@/lib/application-decisions";

type Application = OrientationState & { id: string; version: number; isDemo: boolean; vehicleClass: string; services: string[]; events: { action: string; details?: unknown }[] };
type Approval = { service: string; vehicleClass: string; source: string; revokedAt?: string; validUntil?: string };
export function ApplicationServiceDecision({ application: app, approvals, admin, disabled, onAction }: {
  application: Application; approvals?: Approval[]; admin: boolean; disabled: boolean; onAction: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [now, setNow] = useState(() => Date.now()), [services, setServices] = useState<string[]>([]);
  const [zone, setZone] = useState(""), [rejection, setRejection] = useState(""), [forceReason, setForceReason] = useState(""), [denial, setDenial] = useState("");
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(timer); }, []);
  const gate = orientationDecision(app, now), request = pendingForceApproval(app);
  const active = (service: string) => approvals?.some(a => a.service === service && a.vehicleClass === app.vehicleClass && a.source === "APPLICATION" && !a.revokedAt && (!a.validUntil || new Date(a.validUntil).getTime() > now));
  const allowedForce = ["SUBMITTED", "IN_REVIEW", "RECOMMENDED", "ORIENTATION_SCHEDULED", "ASSESSED", "REJECTED", "ACTIVE", "DEMO_COMPLETED"].includes(app.status);
  const selection = () => ({ services, operatingZone: (() => { try { return JSON.parse(zone); } catch { return null; } })() });
  async function submit(body: Record<string, unknown>) { if (await onAction(body)) { setServices([]); setForceReason(""); setRejection(""); setDenial(""); } }
  return <section className="oa-card" aria-label="Rider service decision"><h2>Approve or reject rider services</h2>
    {app.status === "FORCE_APPROVAL_PENDING" ? <div className="oa-note"><h3>Force approval awaiting Admin</h3>{request ? <>
      <p>Requested by <strong>{request.requestedByName}</strong> · {request.services.join(" / ")}</p><p><strong>Reason:</strong> {request.reason}</p>
      {admin ? <><p>Your Admin decision applies immediately. No second approver is required.</p><button className="oa-primary" disabled={disabled} onClick={() => void submit({ action: "approve-force", requestId: request.requestId })}>Approve force request</button>
        <label>Reason for rejecting this force request<textarea value={denial} maxLength={2000} disabled={disabled} onChange={e => setDenial(e.target.value)} /></label><button disabled={disabled || denial.trim().length < 5} onClick={() => void submit({ action: "deny-force", requestId: request.requestId, reason: denial })}>Reject force request</button></>
        : <p>The rider’s services remain inactive until Admin approves this request.</p>}
    </> : <p>The request has changed. Refresh before continuing.</p>}</div> : <>
      <p className="oa-note" role="status">{gate.message}</p>
      <fieldset disabled={disabled}><legend>Services covered by this decision</legend>{app.services.map(service => <label className="oa-check" key={service}><input type="checkbox" disabled={active(service)} checked={services.includes(service)} onChange={e => setServices(e.target.checked ? [...services, service] : services.filter(s => s !== service))} />{service}{active(service) ? " — already active" : ""}</label>)}</fieldset>
      {app.vehicleClass === "TRICYCLE" && services.includes("RIDE") && <label>Verified permit operating-zone boundary<textarea value={zone} disabled={disabled} onChange={e => setZone(e.target.value)} placeholder="Closed JSON array of [longitude, latitude] points" /></label>}
      <button className="oa-primary" disabled={disabled || !gate.canApprove || !services.length} onClick={() => void submit({ action: "activate", ...selection() })}>Approve rider services</button>
      {gate.canReject && <label>Rejection reason<textarea disabled={disabled} maxLength={2000} value={rejection} onChange={e => setRejection(e.target.value)} /></label>}
      <button disabled={disabled || !gate.canReject || rejection.trim().length < 5} onClick={() => void submit({ action: "reject", reason: rejection })}>Reject application</button>
      {allowedForce && <details className="oa-force-approval"><summary>Force approval · exception</summary><p>Accepted details and documents are still required. This overrides the orientation timing or result. {admin ? "Your Admin action activates the selected services immediately." : "Your request needs Admin approval before any service is activated."}</p>
        <label>Force approval reason<textarea disabled={disabled} minLength={5} maxLength={2000} value={forceReason} onChange={e => setForceReason(e.target.value)} /></label>
        <button disabled={disabled || !services.length || forceReason.trim().length < 5} onClick={() => void submit({ action: "force-approval", reason: forceReason, ...selection() })}>Force approval</button>
      </details>}
    </>}
  </section>;
}
