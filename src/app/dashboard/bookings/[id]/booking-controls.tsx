"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PAYMENT_STATUS_LABEL, type PaymentStatus } from "@/lib/payment-policy";
export function BookingControls({ id, status, paymentStatus, reference, canAssign, riders }: { id: string; status: string; paymentStatus: PaymentStatus; reference: string | null; canAssign: boolean; riders: { id: string; name: string }[] }) {
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function send(event: React.FormEvent<HTMLFormElement>, action: "payment" | "assign") {
    event.preventDefault(); if (pending.current) return;
    const form = new FormData(event.currentTarget);
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/bookings/${id}/${action}`, { method: action === "payment" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn’t save this change.");
      setMessage(data.message); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Service unavailable."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="detail-grid" style={{ marginTop: 20 }}>
    <section className="card" style={{ padding: 20 }}><h2>Payment review</h2><p className="muted small">Update the record after checking the payment. Record a refund only after returning the money.</p>
      <form onSubmit={event => send(event, "payment")}>
        <label>Payment status<select className="input" name="status" defaultValue={paymentStatus} disabled={busy || paymentStatus === "REFUNDED"}>{Object.entries(PAYMENT_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Reference number<input className="input" name="reference" defaultValue={reference ?? ""} maxLength={100} disabled={busy} /></label>
        <label>Reason / evidence<textarea required className="input" name="reason" maxLength={500} disabled={busy} placeholder="Describe how the payment was verified or corrected." /></label>
        <button className="btn btn-primary" disabled={busy || paymentStatus === "REFUNDED"}>{busy ? "Saving…" : "Save payment review"}</button>
      </form>
    </section>
    <section className="card" style={{ padding: 20 }}><h2>{status === "PENDING" ? "Assign rider" : "Reassign rider"}</h2><p className="muted small">Only online riders with the correct vehicle and no active booking are eligible. Offers expire after 2 minutes.</p>
      {canAssign ? <form onSubmit={event => send(event, "assign")}><label>Rider<select className="input" name="riderId" required disabled={busy}><option value="">Choose a rider</option>{riders.map(rider => <option key={rider.id} value={rider.id}>{rider.name}</option>)}</select></label><label>Reason<textarea name="reason" className="input" required maxLength={500} disabled={busy} /></label><button className="btn btn-primary" disabled={busy || !riders.length}>{busy ? "Saving…" : "Send booking offer"}</button>{!riders.length && <p className="muted small">No eligible riders are online.</p>}</form> : <p className="muted small">Assignment is available for due bookings before pickup and before any payment confirmation.</p>}
    </section>
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="error-message">{error}</p>}
  </div>;
}
