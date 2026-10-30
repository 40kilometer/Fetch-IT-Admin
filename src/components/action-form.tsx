"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStaffDraft, DraftNotice } from "./staff-drafts";
type Field = { name: string; label: string; type?: string; value?: string | number; options?: { value: string; label: string }[]; required?: boolean };
export function ActionForm({ url, method = "POST", fields = [], hidden = {}, label = "Save", confirm = false, collapsible = false }: { url: string; method?: string; fields?: Field[]; hidden?: Record<string, unknown>; label?: string; confirm?: boolean; collapsible?: boolean }) {
  const router = useRouter(), form = useRef<HTMLFormElement>(null), dialog = useRef<HTMLDialogElement>(null), pending = useRef(false), snapshot = useRef<Record<string, unknown>>({}), id = useId();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(""), [conflict, setConflict] = useState(false), [confirming, setConfirming] = useState(false);
  const draftFields=fields.filter(field=>field.type==="textarea"&&!/password|secret|token|otp/i.test(field.name));
  const draft=useStaffDraft(`${url}:${String(hidden.id??"")}:${String(hidden.action??label)}:${String(hidden.outcome??"")}`,String(hidden.version??hidden.updatedAt??""),values=>{for(const field of draftFields){const input=form.current?.elements.namedItem(field.name);if(input instanceof HTMLTextAreaElement)input.value=values[field.name]??"";}});
  async function save() {
    if (pending.current) return; pending.current = true; setBusy(true); setError(""); setMessage(""); setConflict(false);
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot.current) }), result = await response.json();
      if (!response.ok) { setConflict(response.status === 409); throw new Error(result.error || "Could not save."); }
      dialog.current?.close(); setConfirming(false); form.current?.reset(); draft.clear(); setMessage(result.message || "Saved."); if (result.redirect) router.push(result.redirect); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Please retry."); }
    finally { pending.current = false; setBusy(false); }
  }
  const content = <><form ref={form} className="card staff-form" aria-busy={busy} onChange={()=>{if(!draftFields.length||!form.current)return;const current=new FormData(form.current);draft.capture(Object.fromEntries(draftFields.map(field=>[field.name,String(current.get(field.name)??"")])));}} onSubmit={event => {
    event.preventDefault(); if (pending.current) return;
    const data = new FormData(event.currentTarget), body: Record<string, unknown> = { ...hidden };
    fields.forEach(field => body[field.name] = field.type === "number" ? Number(data.get(field.name)) : data.get(field.name));
    snapshot.current = body; setError(""); setMessage("");
    if (confirm) { setConfirming(true); dialog.current?.showModal(); } else void save();
  }}><DraftNotice draft={draft}/><fieldset disabled={busy}>{fields.map(field => <label key={field.name}>{field.label}{field.options ? <select className="input" name={field.name} defaultValue={field.value} required={field.required}>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === "textarea" ? <textarea className="input" name={field.name} defaultValue={field.value} required={field.required} maxLength={4000} /> : <input className="input" name={field.name} type={field.type || "text"} defaultValue={field.value} required={field.required} maxLength={field.type === "password" ? 128 : 500} />}</label>)}</fieldset>
    {message && <p role="status" className="success-message">{message}</p>}{error && !confirming && <p role="alert" className="error-message">{error}</p>}{conflict && <button className="btn" type="button" onClick={() => { dialog.current?.close(); router.refresh(); }}>Refresh record (keep entered text)</button>}<button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : label}</button></form>
    <dialog ref={dialog} className="inbox-dialog" aria-labelledby={id} onClose={() => setConfirming(false)} onCancel={event => { if (pending.current) event.preventDefault(); }}><h2 id={id}>{label}?</h2><p>Review the information you entered before confirming this change.</p><dl className="audit-details">{fields.map(field=><div key={field.name}><dt>{field.label}</dt><dd>{field.options?.find(option=>option.value===snapshot.current[field.name])?.label ?? String(snapshot.current[field.name] ?? "")}</dd></div>)}</dl>{error && <p role="alert" className="error-message">{error} Your entered information is preserved.</p>}<div className="staff-actions"><button autoFocus className="btn" disabled={busy} onClick={() => dialog.current?.close()}>Back to form</button><button className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : label}</button></div></dialog>
  </>;
  return collapsible ? <details className="action-disclosure"><summary>{label}</summary>{content}</details> : content;
}
