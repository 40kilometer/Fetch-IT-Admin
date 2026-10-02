"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ReplyForm({ id, status: initialStatus, priority: initialPriority, assignedAdminId: initialAssignee, updatedAt, admins }: { id: string; status: string; priority: string; assignedAdminId: string | null; updatedAt: string; admins: {id:string;name:string}[] }) {
  const router = useRouter();
  const [status,setStatus] = useState(initialStatus), [priority,setPriority] = useState(initialPriority), [assignedAdminId,setAssignee] = useState(initialAssignee ?? "");
  const [reply,setReply] = useState("");
  const [busy,setBusy] = useState(false), [message,setMessage] = useState("");
  return <form className="support-reply" onSubmit={async event => {
    event.preventDefault(); if(busy) return; setBusy(true);setMessage("");
    try {
      const response = await fetch(`/api/support/${id}`, {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status,priority,assignedAdminId,reply,updatedAt})});
      const data = await response.json(); if(!response.ok) throw new Error(data.error || "Couldn’t save the request.");
      setReply("");setMessage("Saved. Replies are visible to the customer in Booking help.");router.refresh();
    } catch(error) {setMessage(error instanceof Error ? error.message : "Please retry.");}
    finally {setBusy(false);}
  }}><div className="support-controls"><label>Status<select className="input" value={status} onChange={e=>setStatus(e.target.value)}>{["OPEN","IN_PROGRESS","RESOLVED"].map(v=><option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}</select></label><label>Priority<select className="input" value={priority} onChange={e=>setPriority(e.target.value)}>{["LOW","NORMAL","HIGH","URGENT"].map(v=><option key={v} value={v}>{v}</option>)}</select></label><label>Assigned admin<select className="input" value={assignedAdminId} onChange={e=>setAssignee(e.target.value)}><option value="">Unassigned</option>{admins.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div><label>New reply<textarea className="input" rows={4} maxLength={2000} value={reply} onChange={e=>setReply(e.target.value)} placeholder="Write a reply, or leave blank to update the request." /></label>{message && <p role="status" className="small">{message}</p>}<button className="btn btn-primary" disabled={busy} type="submit">{busy ? "Saving…" : "Save request"}</button></form>;
}
