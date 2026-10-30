"use client";
import { useId, useRef, useState } from "react";
import {useStaffDraft,DraftNotice} from "./staff-drafts";
export function ConfirmDialog({ trigger, title, description, confirmLabel, onConfirm, reasonLabel, draftId="", danger = false, disabled = false }: { trigger: string; title: string; description: string; confirmLabel: string; onConfirm: (reason: string) => Promise<void>; reasonLabel?: string; draftId?:string; danger?: boolean; disabled?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null), id = useId(), pending = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [reason,setReason]=useState("");
  const draft=useStaffDraft(reasonLabel?draftId:"","",values=>setReason(values.reason??""),{baseline:{reason:""},labels:{reason:reasonLabel??"Decision reason"}});
  return <><button type="button" className={`btn ${danger ? "btn-danger" : ""}`} disabled={disabled} onClick={() => { setError(""); dialog.current?.showModal(); }}>{trigger}</button><dialog ref={dialog} className="inbox-dialog confirm-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={event => { if (pending.current) event.preventDefault(); }}><form onSubmit={async event => {
    event.preventDefault(); if (pending.current) return;
    const form = event.currentTarget, reason = String(new FormData(form).get("reason") ?? "").trim();
    if (reasonLabel && !reason) { setError("Enter a reason before continuing."); return; }
    pending.current = true; setBusy(true); setError("");
    try { await onConfirm(reason); dialog.current?.close(); form.reset();setReason("");draft.clear(); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not save. Please retry."); }
    finally { pending.current = false; setBusy(false); }
  }}><h2 id={`${id}-title`}>{title}</h2><p id={`${id}-description`}>{description}</p><DraftNotice draft={draft}/>{reasonLabel && <label className="dialog-reason">{reasonLabel}<textarea autoFocus className="input" name="reason" value={reason} onChange={event=>{setReason(event.target.value);draft.capture({reason:event.target.value});}} required maxLength={500} rows={4} disabled={busy} /></label>}{error && <p role="alert" className="error-message">{error}</p>}<div className="staff-actions"><button autoFocus={!reasonLabel} type="button" className="btn" disabled={busy} onClick={() => dialog.current?.close()}>Keep unchanged</button><button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} disabled={busy}>{busy ? "Saving…" : confirmLabel}</button></div></form></dialog></>;
}
