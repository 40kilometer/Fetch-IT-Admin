"use client";
import {APPLICATION_STATUS_FILTERS,normalizeApplicationFilter} from "@/lib/application-queue";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { WorkspaceTabs } from "./workspace-tabs";
import { ApplicationServiceDecision } from "./application-service-decision";
import { SECTION_FIELDS, FIELD_LABELS, DOCUMENT_LABELS, type Fields, type Review } from "@/lib/rider-application-policy";
import "./rider-applications.css";
import { useLocalDemo } from '@/hooks/use-local-demo';
import { useVisiblePoll } from '@/hooks/use-visible-poll';

type Document = { id: string; kind: string; version: number; current: boolean; status: string; reason?: string; expiresAt?: string; originalName?: string };
type Application = { isDemo: boolean; id: string; version: number; status: string; vehicleClass: string; services: string[]; fields: Fields; fieldReviews: Record<string, Review>; documents: Document[]; assignedToId?: string; recommendedById?: string; orientationAt?: string; orientationVenue?: string; orientationInstructions?: string; attendedAt?: string; assessmentPassedAt?: string; assessedById?: string; assessmentNotes?: string; user: { name: string; email: string }; events: { id: string; action: string; actorName: string; createdAt: string; details?: Record<string, unknown> }[]; emails: { id: string; kind: string; status: string; failureCode?: string; createdAt: string }[] };
type State = { application?: Application; applications?: Application[]; nextCursor?: string; pendingForceApprovals?: number; actor?: { id: string; canActivate: boolean; canManage?: boolean }; approvals?: { service: string; vehicleClass: string; source: string; revokedAt?: string; validUntil?: string }[] };
const label = (s: string) => s === "DEMO_COMPLETED" ? "Awaiting service activation" : s.replaceAll("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase());
const applicantName = (app: Application) => app.id.startsWith("demo_activity_") ? (app.fields?.legalName || app.user.name).replace(/^Demo · /, "") : app.fields?.legalName || app.user.name;
const applicationValue = (app: Application, key: keyof Fields) => {
  const value = app.fields[key];
  if (!app.id.startsWith("demo_activity_")) return value || "Not supplied";
  if (key === "legalName") return applicantName(app);
  if (value?.startsWith("DEMO — ")) return "Not supplied";
  return value?.replace(/^Demo address · /, "") || "Not supplied";
};
const reviewReason = (reason?: string) => reason?.startsWith("DEMO review state only;") ? "Identity and documents have not been verified." : reason;
const stamp = (date?: string) => date ? new Date(date).toLocaleString("en-PH", { timeZone: "Asia/Manila" }) + " PHT" : "Not scheduled";
export function RiderApplications({ id, initialStatus = "" }: { id?: string; initialStatus?: string }) {
  const lab = useLocalDemo();
  const [stage,setStage]=useState(""),[notice,setNotice]=useState("");
  const mutationVersion = useRef(0);
  const requestSequence = useRef(0);
  const [feedback, setFeedback] = useState("");
  const [data, setData] = useState<State>({}), [error, setError] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState(""), [filter, setFilter] = useState(() => normalizeApplicationFilter(initialStatus)), [cursor, setCursor] = useState("");
  const [schedule, setSchedule] = useState({ date: "", venue: "", instructions: "Bring your original documents and the vehicle named in your application. Arrive 15 minutes before the schedule." });
  const [preview, setPreview] = useState(""), [attended, setAttended] = useState(false), [passed, setPassed] = useState(false), [notes, setNotes] = useState("");
  const endpoint = `/api/rider-applications${id ? "/" + encodeURIComponent(id) : ""}`;
  const requestKey = id ? endpoint : endpoint + '?' + new URLSearchParams({ q: query, status: filter, cursor });
  const resetQueue = useCallback((next: { status?: string; query?: string; cursor?: string }) => {
    requestSequence.current++;
    setCursor(next.cursor ?? '');
    if(next.status !== undefined)setFilter(next.status);
    if(next.query !== undefined)setQuery(next.query);
    setData(previous => ({ ...previous, applications: undefined, nextCursor: undefined }));
    setError('');setLoading(true);
  }, []);
  const load = useCallback(async (background = false, signal?: AbortSignal) => {
    const sequence = ++requestSequence.current;
    const startedAtVersion = mutationVersion.current;
    const current = () => !signal?.aborted && requestSequence.current === sequence && mutationVersion.current === startedAtVersion;
    if (!background) { setLoading(true); setError(''); }
    try {
      const response = await fetch(requestKey, { cache: 'no-store', signal });
      const value = await response.json();
      if (!current()) return;
      if (!response.ok) throw new Error(value.error || 'Could not load applications.');
      setError('');setData(value);
    } catch (error) {
      if (current() && !background) setError(error instanceof Error ? error.message : 'Could not load applications.');
    } finally {
      if (current()) setLoading(false);
    }
  }, [requestKey]);
  useEffect(() => {
    const controller = new AbortController();
    void load(false, controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    if (id || searchText.trim() === query) return;
    const timer = setTimeout(() => resetQueue({ query: searchText.trim() }), 250);
    return () => clearTimeout(timer);
  }, [id, searchText, query, resetQueue]);
  useVisiblePoll(!busy && !loading ? requestKey : '', signal => load(true, signal), 10000, false);
  async function action(body: Record<string, unknown>) {
    mutationVersion.current++;
    setBusy(true); setError(""); setFeedback("");
    try {
      const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: data.application?.version, ...body }) }); const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Could not save this review.");
      if (body.action === "preview") setPreview(result.text); else { setData(previous => ({ ...previous, ...result })); }
      if(body.action === "schedule")setStage("orientation");
      if(body.action === "assessment")setStage("decision");
      if (body.action !== "preview") setFeedback(typeof result.message === "string" ? result.message : ({review:"Review decision saved.",claim:"Application assigned to you.",corrections:"Correction request saved. Check email history for delivery status.",schedule:"Orientation saved. Check email history for invitation delivery.",activate:"Service access updated.",assessment:"Assessment saved.",recommend:"Recommendation submitted.",reject:"Rejection recorded."} as Record<string,string>)[String(body.action)] || "Change saved successfully.");
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save this review."); return false; } finally { setBusy(false); }
  }
  const app = data.application, canApprove = data.actor?.canActivate, admin = data.actor?.canManage;
  const orientation = () => ({ orientationAt: schedule.date ? new Date(schedule.date + "+08:00").toISOString() : "", venue: schedule.venue, instructions: schedule.instructions });
  async function previewPdf() {
    setBusy(true); setError(""); setFeedback("");
    try {
      const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", pdf: true, ...orientation() }) });
      if (!r.ok) throw new Error((await r.json()).error || "PDF preview unavailable.");
      const url = URL.createObjectURL(await r.blob()), a = document.createElement("a"); a.href = url; a.download = "Fetch-It-Orientation-Preview.pdf"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { setError(e instanceof Error ? e.message : "PDF preview unavailable."); } finally { setBusy(false); }
  }
  if (!id) return <section className="oa">{lab.enabled && <aside className="oa-card" style={{ borderColor: '#c87338' }}><strong>LOCAL DEMO LAB</strong><p>Live connection to the isolated Rider test data. To return an application, mark an item Needs correction, give a reason, then request corrections. Emails are captured locally.</p><a href={lab.riderUrl} target="_blank" rel="noreferrer">Open connected Rider ↗</a> · <Link href="/login">Switch demo staff</Link></aside>}<div className="oa-heading"><div><p className="oa-eyebrow">RIDER ONBOARDING</p><h1>Applications</h1><p>Review details, request specific corrections, and prepare riders for their first booking.</p></div><button onClick={() => void load()} disabled={loading}>Refresh</button></div>
    <form className="oa-toolbar" aria-label="Filter rider applications" onSubmit={event => { event.preventDefault(); if (searchText.trim() === query && !cursor) void load(); else resetQueue({ query: searchText.trim() }); }}><input name="q" type="search" aria-label="Search applicants" placeholder="Search name or email" value={searchText} onChange={event => setSearchText(event.target.value)}/><select name="status" aria-label="Application status" value={filter} onChange={event => resetQueue({ status: event.target.value, query: searchText.trim() })}><option value="">All statuses</option>{APPLICATION_STATUS_FILTERS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></form>
    {data.actor?.canManage && !filter && (data.pendingForceApprovals ?? 0) > 0 && <Link className="oa-card" href="/dashboard/applications?status=FORCE_APPROVAL_PENDING">Force approvals awaiting Admin: {data.pendingForceApprovals ?? 0}</Link>}{error && <p role="alert" className="error-message">{error}</p>}{loading && <p role="status">Loading applications…</p>}
    <div className="oa-list" aria-busy={loading}>{!loading && !error && data.applications?.map(a => <Link className="oa-card oa-row" href={`/dashboard/applications/${a.id}`} key={a.id}><div><strong>{applicantName(a)}</strong>{a.isDemo && <span className="oa-badge" title="Generated details were used to fill this application">Autofilled</span>}<p>{a.user.email}</p><small>{label(a.vehicleClass)} · {a.services.map(label).join(" / ")}</small></div><span className="oa-badge" data-status={a.status}>{label(a.status)} →</span></Link>)}</div>
    {!loading && !error && !data.applications?.length && <div className="oa-card">No matching applications. New applicants appear here after starting their application.</div>}
    <div className="oa-toolbar">{!loading && !error && cursor && <button onClick={() => resetQueue({ cursor: "" })}>Back to first page</button>}{!loading && !error && data.nextCursor && <button onClick={() => resetQueue({ cursor: data.nextCursor })}>Next page</button>}</div></section>;
  if (!app) return <section className="oa"><Link href="/dashboard/applications">← Applications</Link><p role={error ? "alert" : "status"}>{error || "Loading application…"}</p><button onClick={() => void load()}>Retry</button></section>;
  const reviewable = ["SUBMITTED", "IN_REVIEW"].includes(app.status);
  const needsClaim = !!canApprove && !admin && app.assignedToId !== data.actor?.id;
  const claimable = ["SUBMITTED", "IN_REVIEW", "RECOMMENDED", "ORIENTATION_SCHEDULED", "ASSESSED", "REJECTED", "DEMO_COMPLETED"].includes(app.status);
  return <section className="oa">{lab.enabled && <aside className="oa-card" style={{ borderColor: '#c87338' }}><strong>LOCAL DEMO LAB</strong><p>Live connection to the isolated Rider test data. To return an application, mark an item Needs correction, give a reason, then request corrections. Emails are captured locally.</p><a href={lab.riderUrl} target="_blank" rel="noreferrer">Open connected Rider ↗</a> · <Link href="/login">Switch demo staff</Link></aside>}<Link href="/dashboard/applications">← Applications</Link><div className="oa-heading oa-detail-header"><div><p className="oa-eyebrow">Rider application</p><h1>{applicantName(app)}</h1><p className="oa-muted">{app.user.email} · {label(app.vehicleClass)} · {app.services.map(label).join(" / ")}</p></div><span className="oa-badge" data-status={app.status}>{label(app.status)}</span></div>
    {error && <p role="alert" className="error-message">{error}</p>}{feedback && <p role="status" className="success-message">{feedback}</p>}
    <div className="oa-toolbar"><button disabled={busy || loading} onClick={() => void load()}>Refresh</button>{claimable && <button disabled={busy || app.assignedToId === data.actor?.id} onClick={() => void action({ action: "claim" })}>{app.assignedToId === data.actor?.id ? "Claimed by you" : "Claim application"}</button>}</div>
    <div className="oa-workflow-summary"><div><span className="oa-eyebrow">Next step</span><p>{needsClaim ? "Claim this application to start reviewing and recording decisions." : app.status === "ACTIVE" ? "Services are active. Review the approvals or recorded history below." : app.status === "FORCE_APPROVAL_PENDING" ? "Admin can now review the force approval request." : ["ASSESSED", "DEMO_COMPLETED"].includes(app.status) ? "Review the orientation result and make a service decision." : app.orientationAt ? "Record the orientation result, then decide service access." : reviewable ? "Review the checklist, then schedule orientation." : "Review the application status and recorded history."}</p></div><span className="oa-muted">All decisions are recorded</span></div>
    {notice && <p role="status" className="success-message">{notice}</p>}
    <WorkspaceTabs label="Application stages" value={stage || (app.status === "FORCE_APPROVAL_PENDING" || app.status === "ASSESSED" || app.status === "ACTIVE" || app.status === "DEMO_COMPLETED" ? "decision" : app.orientationAt ? "orientation" : "review")} onChange={setStage} items={[
      { id: "review", label: "1. Review checklist", content: <>
    <ApplicationChecklist app={app} endpoint={endpoint} disabled={busy || needsClaim} reviewable={reviewable} onAction={action} />
    {reviewable && <section className="oa-card"><h2>Complete this review</h2><p>Request any corrections, or approve the completed checklist and open Orientation to schedule the rider.</p><div className="oa-toolbar"><button className="oa-primary" onClick={() => setStage("orientation")}>Continue to orientation →</button><button disabled={busy || needsClaim} onClick={() => void action({ action: "corrections" })}>Request corrections & email rider</button></div></section>}
    </> },
      { id: "orientation", label: "2. Orientation", content: <fieldset disabled={busy || needsClaim}>
    {canApprove && ["SUBMITTED", "IN_REVIEW", "RECOMMENDED", "ORIENTATION_SCHEDULED", "ASSESSED"].includes(app.status) && <details open={!app.orientationAt} className="oa-card"><summary>{app.orientationAt ? "Change orientation schedule" : "Schedule orientation"}</summary><section className="oa-schedule-form"><h2>Approve documents & schedule orientation</h2><p>Accept all required details and documents first. You can approve this application yourself and continue through its assessment and activation.</p><form onSubmit={e => { e.preventDefault(); void action({ action: "schedule", ...orientation() }); }}><label>Orientation date and time — Philippine time<input type="datetime-local" required value={schedule.date} onChange={e => setSchedule({ ...schedule, date: e.target.value })}/></label><label>Venue or meeting instructions<input required minLength={5} maxLength={2000} value={schedule.venue} onChange={e => setSchedule({ ...schedule, venue: e.target.value })}/></label><label>What to bring / orientation instructions<textarea required minLength={5} maxLength={2000} value={schedule.instructions} onChange={e => setSchedule({ ...schedule, instructions: e.target.value })}/></label><div className="oa-toolbar"><button type="button" disabled={busy || !schedule.date} onClick={() => void action({ action: "preview", ...orientation() })}>Preview email</button><button type="button" disabled={busy || !schedule.date} onClick={() => void previewPdf()}>Preview PDF</button><button className="oa-primary" disabled={busy}>Approve & send invitation with PDF</button></div></form>{preview && <pre className="oa-preview">{preview}</pre>}</section></details>}
    {app.orientationAt && <section className="oa-card"><h2>Orientation & assessment</h2><p><strong>{stamp(app.orientationAt)}</strong><br/>{app.orientationVenue}</p><p>{app.orientationInstructions}</p><a href={`${endpoint}?letter=1`}>Download orientation PDF</a>{app.assessedById && <div className="oa-note"><strong>{app.assessmentPassedAt ? "Assessment passed" : app.attendedAt ? "Assessment not passed" : "Did not attend"}</strong><p>{app.assessmentNotes}</p></div>}{["ORIENTATION_SCHEDULED", "ASSESSED"].includes(app.status) && <AssessmentForm key={app.id} app={app} disabled={busy || needsClaim} onAction={action} />}</section>}
    {!app.orientationAt && !["SUBMITTED", "IN_REVIEW", "RECOMMENDED"].includes(app.status) && <p className="oa-note">No orientation is scheduled for this application.</p>}
    </fieldset> },
      { id: "decision", label: "3. Service decision", content: <>
    {canApprove && !admin && app.assignedToId !== data.actor?.id && <p className="oa-note">Claim this application before recording a result or making a service decision.</p>}
    {canApprove && <ApplicationServiceDecision application={app} approvals={data.approvals} admin={!!admin} disabled={busy || (!admin && app.assignedToId !== data.actor?.id)} onAction={action} />}
    <section className="oa-card"><h2>Service approvals</h2>{!data.approvals?.length && <p className="oa-muted">No service access has been granted.</p>}{data.approvals?.map((a, index) => <p key={index}>{label(a.service)} — {a.revokedAt ? "Revoked" : a.validUntil && new Date(a.validUntil) < new Date() ? "Expired" : "Active"} · {a.source === "LEGACY_EXISTING" ? "Legacy access, not document verified" : "Reviewed application"}</p>)}</section>
    </> },
      { id: "history", label: `History · ${app.events.length}`, content: <>
    <section className="oa-card"><h2>Email history</h2>{app.emails.map(email => <EmailItem key={email.id} email={email} localDemo={lab.enabled} canSend={!!canApprove} disabled={busy} resend={confirmResend => action({ action: "email", emailId: email.id, confirmResend })}/>)}{!app.emails.length && <p>No emails queued yet.</p>}</section>
    {admin && <details className="oa-card"><summary>Reopen application for a fresh review</summary><p>This revokes existing service access, takes the rider offline, and resets the checklist. Active assignments must be resolved first.</p><form onSubmit={e => { e.preventDefault(); void action({ action: "reopen", reason: String(new FormData(e.currentTarget).get("reason")) }); }}><label>Reason<textarea name="reason" required minLength={5} maxLength={2000}/></label><button disabled={busy}>Reopen & revoke service access</button></form></details>}
    <section className="oa-card"><h2>Application audit history</h2><p className="oa-muted">Application ID: {app.id} · Entry method: {app.isDemo ? "Prefilled" : "Manual"}</p>{app.events.map(event => <p key={event.id}><strong>{label(event.action)}</strong> · {event.actorName}<br/><small>{stamp(event.createdAt)}</small>{typeof event.details?.reason === "string" && <><br/><span>Reason: {event.details.reason}</span></>}</p>)}{!app.events.length && <p className="oa-muted">No actions recorded yet.</p>}</section>
    </> },
    ]} />
  </section>;
}
function AssessmentForm({ app, disabled, onAction }: { app: Application; disabled: boolean; onAction: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [attended, setAttended] = useState(!!app.attendedAt), [passed, setPassed] = useState(!!app.assessmentPassedAt), [notes, setNotes] = useState(app.assessmentNotes ?? "");
  return <details open={!app.assessedById} className="oa-assessment"><summary>{app.assessedById ? "Update assessment result" : "Record assessment result"}</summary><form onSubmit={event => { event.preventDefault(); void onAction({ action: "assessment", attended, passed, notes }); }}><fieldset disabled={disabled}><label className="oa-check"><input type="checkbox" checked={attended} onChange={event => { setAttended(event.target.checked); if (!event.target.checked) setPassed(false); }} />Attended orientation</label><label className="oa-check"><input type="checkbox" checked={passed} disabled={!attended} onChange={event => setPassed(event.target.checked)} />Passed the vehicle inspection and required service assessments</label><label>Assessment notes<textarea required minLength={5} maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} /></label><button className="oa-primary" disabled={disabled}>Record assessment</button></fieldset></form></details>;
}
function ApplicationChecklist({ app, endpoint, disabled, reviewable, onAction }: { app: Application; endpoint: string; disabled: boolean; reviewable: boolean; onAction: (body: Record<string, unknown>) => Promise<boolean> }) {
  const sections = Object.entries(SECTION_FIELDS), documents = app.documents.filter(doc => doc.current);
  const items = [...sections.map(([section]) => ({ id: section, name: label(section), status: app.fieldReviews[section]?.status || "PENDING" })), ...documents.map(doc => ({ id: doc.id, name: DOCUMENT_LABELS[doc.kind] || doc.kind, status: doc.status }))];
  const [selection, setSelection] = useState(() => items.find(item => item.status === "PENDING")?.id ?? items[0]?.id);
  const selected = items.some(item => item.id === selection) ? selection : items[0]?.id;
  const complete = items.filter(item => ["ACCEPTED", "NOT_APPLICABLE"].includes(item.status)).length;
  return <div className="oa-checklist"><div className="oa-checklist-heading"><div><h2>Details & documents</h2><p className="oa-muted">Review one item at a time. Your saved decisions appear in the checklist.</p></div><strong>{complete} / {items.length} reviewed</strong></div>
    <div className="oa-review-workspace"><nav className="oa-item-list" aria-label="Review checklist">
      <h3>Application details</h3>{items.map((item, index) => <div key={item.id}>{index === sections.length && <h3>Documents</h3>}<button type="button" aria-pressed={selected === item.id} onClick={() => setSelection(item.id)}><span>{item.name}</span><small className={`oa-review-status status-${item.status.toLowerCase()}`}>{label(item.status)}</small></button></div>)}
    </nav><div className="oa-review-content">
      {sections.map(([section, keys]) => <article hidden={selected !== section} className="oa-card" key={section}><div className="oa-heading"><h3>{label(section)}</h3><span className="oa-badge" data-status={app.fieldReviews[section]?.status || "PENDING"}>{label(app.fieldReviews[section]?.status || "PENDING")}</span></div><dl>{keys.map(key => <div key={key}><dt>{FIELD_LABELS[key]}</dt><dd>{applicationValue(app, key)}</dd></div>)}</dl>{app.fieldReviews[section]?.reason && <p className="oa-error">{reviewReason(app.fieldReviews[section].reason)}</p>}{reviewable && <ReviewControls disabled={disabled} onReview={(status, reason) => onAction({ action: "review", section, status, reason })} />}</article>)}
      {documents.map(doc => <article hidden={selected !== doc.id} className="oa-card" key={doc.id}><div className="oa-heading"><h3>{DOCUMENT_LABELS[doc.kind] || doc.kind}</h3><span className="oa-badge" data-status={doc.status}>{label(doc.status)}</span></div><p><a className="oa-document-link" href={`${endpoint}?document=${encodeURIComponent(doc.id)}`} target="_blank" rel="noreferrer">Open private document ↗</a></p><p className="oa-muted">{doc.originalName && <>{doc.originalName} · </>}Version {doc.version}{doc.expiresAt ? ` · Expires ${stamp(doc.expiresAt)}` : ""}</p>{doc.reason && <p className="oa-error">{doc.reason}</p>}{reviewable && <ReviewControls disabled={disabled} allowNA onReview={(status, reason) => onAction({ action: "review", documentId: doc.id, status, reason })} />}<details><summary>Previous uploads</summary>{app.documents.filter(old => !old.current && old.kind === doc.kind).map(old => <p key={old.id}><a href={`${endpoint}?document=${encodeURIComponent(old.id)}`} target="_blank" rel="noreferrer">Version {old.version} — {label(old.status)}</a>{old.reason && `: ${old.reason}`}</p>)}</details></article>)}
    </div></div>
  </div>;
}
function ReviewControls({ disabled, onReview, allowNA = false }: { disabled: boolean; allowNA?: boolean; onReview: (status: string, reason: string) => Promise<boolean> }) {
  const [status, setStatus] = useState("ACCEPTED"), [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false), [saved, setSaved] = useState(false);
  async function save() {
    if (disabled || saving) return;
    setSaving(true); setSaved(false);
    try { setSaved(await onReview(status, reason)); } finally { setSaving(false); }
  }
  return <form className="oa-review" aria-busy={saving} onSubmit={(e: FormEvent) => { e.preventDefault(); void save(); }}><label>Review decision<select disabled={disabled || saving} value={status} onChange={e => { setStatus(e.target.value); setSaved(false); }}><option value="ACCEPTED">Accepted</option><option value="NEEDS_CORRECTION">Needs correction</option>{allowNA && <option value="NOT_APPLICABLE">Not applicable — optional documents only</option>}</select></label>{status === "NEEDS_CORRECTION" && <label>Explain exactly what to replace<textarea disabled={disabled || saving} required minLength={5} maxLength={2000} value={reason} onChange={e => { setReason(e.target.value); setSaved(false); }}/></label>}<button disabled={disabled || saving}>{saving ? "Saving…" : "Save decision"}</button>{saved && <p role="status" className="success-message">Decision saved.</p>}</form>;
}
function EmailItem({ email, localDemo, canSend, disabled, resend }: { localDemo: boolean; email: Application["emails"][number]; canSend: boolean; disabled: boolean; resend: (confirm: boolean) => Promise<boolean> }) {
  const [confirmed, setConfirmed] = useState(false);
  return <div className="oa-email"><strong>{label(email.kind)}</strong> · {email.status === "SENT" ? localDemo ? "Captured in local demo inbox" : "Accepted by mail server" : label(email.status)}<small>{stamp(email.createdAt)}</small>{canSend && email.status !== "SENT" && <><label className="oa-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>I checked the mailbox; resend if the previous outcome is uncertain.</label><button disabled={disabled} onClick={() => void resend(confirmed)}>Retry email</button></>}</div>;
}
