"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ReplyForm({ id, status: initialStatus, reply: initialReply }: { id: string; status: string; reply: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [reply, setReply] = useState(initialReply ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <form style={{ display: "grid", gap: 10 }} onSubmit={async (event) => {
    event.preventDefault(); if (busy) return; setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/support/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reply }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn’t save the reply.");
      setMessage("Reply saved. The customer can see it in Booking help."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Request failed. Please retry."); }
    finally { setBusy(false); }
  }}>
    <label style={{ display: "grid", gap: 6 }}>Status<select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>{["OPEN", "IN_PROGRESS", "RESOLVED"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
    <label style={{ display: "grid", gap: 6 }}>Reply to customer<textarea className="input" rows={3} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} /></label>
    {message && <p role="status" style={{ fontSize: 13 }}>{message}</p>}
    <button className="btn btn-primary" disabled={busy} type="submit">{busy ? "Saving…" : "Save reply and status"}</button>
  </form>;
}
