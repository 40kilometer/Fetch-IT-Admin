"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { humanize } from "@/lib/admin-ui";
export function ReplyForm({ id, status: initialStatus, priority: initialPriority, assignedAdminId: initialAssignee, updatedAt, admins, recipient, staffId, canManage }: { id: string; status: string; priority: string; assignedAdminId: string | null; updatedAt: string; admins: { id: string; name: string }[]; recipient: string; staffId: string; canManage: boolean }) {
  const router = useRouter(), pending = useRef(false), version = useRef(updatedAt);
  const saved = useRef({ status: initialStatus, priority: initialPriority, assignee: initialAssignee });
  const [status, setStatus] = useState(initialStatus), [priority, setPriority] = useState(initialPriority), [assignedAdminId, setAssignee] = useState(initialAssignee ?? "");
  const [reply, setReply] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(""), [conflict, setConflict] = useState(false);
  useEffect(() => { version.current = updatedAt; saved.current = { status: initialStatus, priority: initialPriority, assignee: initialAssignee }; setStatus(initialStatus); setPriority(initialPriority); setAssignee(initialAssignee ?? ""); }, [updatedAt, initialStatus, initialPriority, initialAssignee]);
  async function save(action: "details" | "reply" | "resolve" | "claim") {
    if (pending.current) return;
    if ((action === "reply" || action === "resolve") && !reply.trim()) { setError("Write a reply before sending."); return; }
    pending.current = true; setBusy(true); setMessage(""); setError(""); setConflict(false);
    const publicReply = action === "reply" || action === "resolve";
    try {
      const response = await fetch(`/api/support/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        status: action === "resolve" ? "RESOLVED" : action === "details" ? status : saved.current.status,
        priority: action === "details" ? priority : saved.current.priority,
        assignedAdminId: action === "claim" ? staffId : action === "details" ? assignedAdminId || null : saved.current.assignee,
        reply: publicReply ? reply : "", updatedAt: version.current,
      }) });
      const data = await response.json();
      if (!response.ok) { setConflict(response.status === 409); throw new Error(data.error || "Could not save the request."); }
      version.current = data.ticket.updatedAt;
      saved.current = { status: data.ticket.status, priority: data.ticket.priority, assignee: data.ticket.assignedAdminId };
      if (publicReply) setReply("");
      setMessage(action === "claim" ? "Request assigned to you." : publicReply ? action === "resolve" ? "Reply sent to the customer and request resolved." : "Reply sent to the customer." : "Request details updated. No message was sent.");
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Please retry."); }
    finally { pending.current = false; setBusy(false); }
  }
  const claimed = initialAssignee === staffId || canManage;
  return <div className="support-reply">
    {!initialAssignee && <div className="workflow-summary"><p>This request is unassigned. Claim it to take ownership.</p><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save("claim")}>Claim request</button></div>}
    <form onSubmit={event => { event.preventDefault(); const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null; void save(button?.value === "resolve" ? "resolve" : "reply"); }}><fieldset disabled={busy || !claimed}><legend>Reply to {recipient}</legend><label>Message to the customer<textarea className="input" rows={5} required maxLength={2000} value={reply} onChange={e => setReply(e.target.value)} placeholder="Write a reply the customer will receive." /></label><div className="row-actions"><button className="btn btn-primary" type="submit" value="reply">Send reply</button><button className="btn" type="submit" value="resolve">Send and resolve</button></div></fieldset></form>
    <details className="action-disclosure"><summary>Assignment, priority & status</summary><form onSubmit={event => { event.preventDefault(); void save("details"); }}><fieldset disabled={busy || !claimed}><legend>Request details</legend><div className="support-controls"><label>Status<select className="input" value={status} onChange={e => setStatus(e.target.value)}>{["OPEN", "IN_PROGRESS", "RESOLVED"].map(v => <option key={v} value={v}>{humanize(v)}</option>)}</select></label><label>Priority<select className="input" value={priority} onChange={e => setPriority(e.target.value)}>{["LOW", "NORMAL", "HIGH", "URGENT"].map(v => <option key={v} value={v}>{humanize(v)}</option>)}</select></label><label>Assigned to<select className="input" value={assignedAdminId} onChange={e => setAssignee(e.target.value)} disabled={!canManage}><option value="">Unassigned</option>{admins.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div><button className="btn" type="submit">Update details</button></fieldset></form></details>
    {!claimed && <p className="muted small">Claim this request before replying. Your draft stays here when the record is refreshed.</p>}
    {busy && <p role="status">Saving…</p>}{message && <p role="status" className="success-message">{message}</p>}{error && <p role="alert" className="error-message">{error}</p>}{conflict && <button className="btn" type="button" onClick={() => router.refresh()}>Refresh request (keep reply draft)</button>}
  </div>;
}
