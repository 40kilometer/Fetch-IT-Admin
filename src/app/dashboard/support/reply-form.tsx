"use client";
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useStaffDraft,DraftNotice,confirmStaffNavigation} from '@/components/staff-drafts';
import {ClaimEntry} from '@/components/claim-entry';
export function ReplyForm({id,status:initialStatus,assignedAdminId:initialAssignee,assignedName,updatedAt,admins,recipient,staffId,canManage}:{id:string;status:string;assignedAdminId:string|null;assignedName?:string;updatedAt:string;admins:{id:string;name:string}[];recipient:string;staffId:string;canManage:boolean}){
 const router=useRouter(),pending=useRef(false),version=useRef(updatedAt);
 const [current,setCurrent]=useState({status:initialStatus,assignee:initialAssignee,name:assignedName});
 const [assignedAdminId,setAssignee]=useState(initialAssignee??''),[reply,setReply]=useState(''),[reason,setReason]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[conflict,setConflict]=useState(false);
 const assignmentEdited=useRef(false);
 useEffect(()=>{version.current=updatedAt;setCurrent({status:initialStatus,assignee:initialAssignee,name:assignedName});if(!assignmentEdited.current)setAssignee(initialAssignee??'');},[updatedAt,initialStatus,initialAssignee,assignedName]);
 const draft=useStaffDraft(`support:${id}:public-reply`,updatedAt,values=>setReply(values.reply??''));
 const assignmentDraft=useStaffDraft(`support:${id}:assignment`,updatedAt,values=>{if(values.assignee===''||admins.some(person=>person.id===values.assignee)){assignmentEdited.current=true;setAssignee(values.assignee)}},{baseline:{assignee:initialAssignee??''},labels:{assignee:'Assigned staff'}});
 const reopenDraft=useStaffDraft(`support:${id}:reopen`,updatedAt,values=>setReason(values.reason??''),{baseline:{reason:''},labels:{reason:'Reason for reopening'}});
 async function save(action:'reply'|'resolve'|'reassign'|'reopen'){
  if(pending.current)return;
  if((action==='reply'||action==='resolve')&&!reply.trim()){setError('Write a reply before sending.');return;}
  pending.current=true;setBusy(true);setMessage('');setError('');setConflict(false);
  try{
   const response=await fetch(`/api/support/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,updatedAt:version.current,...(action==='reassign'?{assignedAdminId:assignedAdminId||null}:action==='reopen'?{reason}:{reply})})});
   const data=await response.json();if(!response.ok){setConflict(response.status===409);throw Error(data.error||'Could not save this request.');}
   version.current=data.ticket.updatedAt;setCurrent({status:data.ticket.status,assignee:data.ticket.assignedAdminId,name:data.ticket.assignedAdmin?.name});
   if(action==='reassign'){assignmentEdited.current=false;assignmentDraft.clear({assignee:data.ticket.assignedAdminId??''});}
   if(action==='reply'||action==='resolve'){setReply('');draft.clear();}
   if(action==='reopen'){setReason('');reopenDraft.clear();}
   setMessage(({reply:'Reply sent. Request remains in review.',resolve:'Reply sent and request resolved.',reassign:'Request reassigned. No message was sent.',reopen:'Request reopened. The reason is recorded in the audit log.'})[action]);router.refresh();
  }catch(cause){setError(cause instanceof Error?cause.message:'Could not save. Your unsent work is preserved.');}
  finally{pending.current=false;setBusy(false);}
 }
 const owned=current.assignee===staffId,resolved=current.status==='RESOLVED',name=current.name??admins.find(person=>person.id===current.assignee)?.name??'another staff member';
 return <div className="support-reply"><div className="workflow-summary" role="status"><strong>{resolved?'Resolved':current.assignee?`${current.status==='IN_PROGRESS'?'Under review by':'Assigned to'} ${name}`:'Unassigned request'}</strong><p>Status follows the work: claim to start review, then send a reply or send and resolve.</p></div>
 {!resolved&&(!current.assignee||owned&&current.status==='OPEN')&&<ClaimEntry button href={`/dashboard/support/${id}`} endpoint={`/api/support/${id}`} revision={version.current} kind="support" recordLabel={recipient} claimable>Claim & start review</ClaimEntry>}
 {!resolved&&!owned&&current.assignee&&<p className="muted small">You are viewing this request. Its owner handles customer replies. Admin or a supervisor can reassign it.</p>}
 {!resolved&&owned&&<form onSubmit={event=>{event.preventDefault();const button=(event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;void save(button?.value==='resolve'?'resolve':'reply');}}><fieldset disabled={busy}><legend>Public reply to {recipient}</legend><DraftNotice draft={draft}/><label>Message to the customer<textarea className="input" rows={5} required maxLength={2000} value={reply} onChange={event=>{setReply(event.target.value);draft.capture({reply:event.target.value});}} placeholder="Write a reply the customer will receive."/></label><div className="row-actions"><button className="btn btn-primary" type="submit" value="reply">Send reply</button><button className="btn" type="submit" value="resolve">Send and resolve</button></div></fieldset></form>}
 {canManage&&!resolved&&<details className="action-disclosure"><summary>Reassign request</summary><form onSubmit={event=>{event.preventDefault();void save('reassign');}}><fieldset disabled={busy}><DraftNotice draft={assignmentDraft}/><label>Assigned to<select className="input" value={assignedAdminId} onChange={event=>{assignmentEdited.current=true;setAssignee(event.target.value);assignmentDraft.capture({assignee:event.target.value});}}><option value="">Unassigned</option>{admins.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label><button className="btn" disabled={assignedAdminId===(current.assignee??'')}>Reassign request</button></fieldset></form></details>}
 {canManage&&resolved&&<details className="action-disclosure"><summary>Reopen request</summary><form onSubmit={event=>{event.preventDefault();void save('reopen');}}><fieldset disabled={busy}><DraftNotice draft={reopenDraft}/><label>Reason for reopening<textarea className="input" required minLength={5} maxLength={2000} value={reason} onChange={event=>{setReason(event.target.value);reopenDraft.capture({reason:event.target.value});}}/></label><button className="btn">Reopen request</button></fieldset></form></details>}
 {busy&&<p role="status">Saving…</p>}{message&&<p role="status" className="success-message">{message}</p>}{error&&<p role="alert" className="error-message">{error}</p>}{conflict&&<button className="btn" type="button" onClick={async()=>{if(await confirmStaffNavigation('Refresh this request with unsaved changes?'))router.refresh();}}>Refresh request (keep reply draft)</button>}
 </div>;
}
