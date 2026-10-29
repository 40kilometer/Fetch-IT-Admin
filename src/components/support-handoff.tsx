"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { REVIEW_PRIORITIES, reviewLabel } from "@/lib/review-queue";

export function SupportHandoff({ ticketId, disabled = false }: { ticketId: string; disabled?: boolean }) {
  const router = useRouter(), sending = useRef(false);
  const [destination, setDestination] = useState("ESCALATION"), [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState("");
  const safety = destination === "SAFETY";
  return <details className="section-block handoff-panel"><summary className="btn">Request supervisor help / Send to Safety Review</summary><form className="card staff-form" aria-busy={busy} onSubmit={async event => {
    event.preventDefault(); if (sending.current) return;
    const form = event.currentTarget, data = new FormData(form);
    sending.current = true; setBusy(true); setSent(false); setError("");
    try {
      const response = await fetch("/api/cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticketId, kind: destination, title: data.get("title"), helpReason: data.get("helpReason"), tried: data.get("tried"), priority: data.get("priority") }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not send the request.");
      form.reset(); setSent(true); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send the request. Please retry."); }
    finally { sending.current = false; setBusy(false); }
  }}><h2>{safety ? "Send to Safety Review" : "Request supervisor help"}</h2><p>Internal handoff. The receiving staff can review the linked customer conversation and booking. This does not resolve the customer’s request.</p><fieldset disabled={busy || disabled}>
    <label>Send to<select className="input" value={destination} onChange={event => { setDestination(event.target.value); setSent(false); setError(""); }}><option value="ESCALATION">Support Supervisor</option><option value="SAFETY">Safety Review</option></select></label>
    <label>Issue title<input className="input" name="title" required maxLength={160} /></label>
    <label>{safety ? "Why does this need Safety Review?" : "Why do you need supervisor help?"}<textarea className="input" name="helpReason" required maxLength={1800} rows={4} /></label>
    <label>What have you already tried?<textarea className="input" name="tried" required maxLength={1800} rows={4} /></label>
    <label>How urgent is this?<select className="input" name="priority" required defaultValue=""><option value="" disabled>Choose a priority</option>{REVIEW_PRIORITIES.map(value => <option key={value} value={value}>{reviewLabel(value)}</option>)}</select></label>
  </fieldset>{disabled && <p className="warning-message">Claim this customer request before sending a handoff.</p>}{sent && <p role="status" className="success-message">Your request has been sent to {safety ? "Safety Review" : "the Support Supervisor"}. Track updates in <a href="/dashboard/cases">My escalated requests</a>.</p>}{error && <p role="alert" className="error-message">{error}</p>}<button className="btn btn-primary" disabled={busy || disabled}>{busy ? "Sending…" : safety ? "Send to Safety Review" : "Send to supervisor"}</button></form></details>;
}
