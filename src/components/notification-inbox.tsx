'use client';
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import type {Notice,NoticeView} from '@/lib/staff-notifications';
import {useSafetyAlertSound} from './safety-alert-sound';
import {SafetyAlertDone} from './safety-alert-done';
type Packet={items:Notice[];checkedAt:string};
type Props={actorId:string;role:string;renderLink:(item:Notice,children:ReactNode,onNavigate:()=>void)=>ReactNode};
const labels:Record<NoticeView,string>={personal:'My alerts',team:'Team intake',general:'Operations',platform:'Platform alerts'};
export function NotificationInbox({actorId,role,renderLink}:Props){
 const {observe,controls:soundControls,enabled:soundEnabled}=useSafetyAlertSound(actorId,role);
 const owner=role==='SUPERADMIN',dialog=useRef<HTMLDialogElement>(null);
 const views:NoticeView[]=owner?['platform','personal','general']:['personal','team','general'];
 const [view,setView]=useState<NoticeView>(owner?'platform':'personal');
 const [packets,setPackets]=useState<Partial<Record<NoticeView,Packet>>>({});
 const [error,setError]=useState(''),[saving,setSaving]=useState(false),[retry,setRetry]=useState(0);
 const [completionNotice,setCompletionNotice]=useState('');
 const personalUnread=(packets.personal?.items??[]).filter(item=>!item.read).length+(owner?(packets.platform?.items??[]).filter(item=>!item.read).length:0);
 const active=packets[view],unread=(active?.items??[]).filter(item=>!item.read).length;
 const urgent=Object.values(packets).flatMap(packet=>packet?.items??[]).filter(item=>item.urgent);
 const urgentIds=new Set(urgent.map(item=>`${item.entityType}:${item.entityId}`));
 const refresh=useCallback(()=>setRetry(value=>value+1),[]);
 useEffect(()=>{
  let stopped=false,running=false;const controller=new AbortController();
  const wanted:NoticeView[]=owner?['platform','personal','general']:['personal','team','general'];
  async function update(){
   if(stopped||running)return;running=true;
   try{
    const responses=await Promise.all(wanted.map(async current=>{
     const response=await fetch(`/api/notifications?view=${current}`,{cache:'no-store',signal:controller.signal});
     const data=await response.json();if(!response.ok||!Array.isArray(data.items))throw Error(response.status===401?'Your session expired. Sign in again.':'Notifications could not refresh. The last received alerts remain below.');
     return [current,data] as const;
    }));
    if(!stopped){observe(responses.flatMap(([,packet])=>packet.items));setPackets(Object.fromEntries(responses));setError('');}
   }catch(cause){if(!stopped)setError(cause instanceof Error?cause.message:'Could not refresh notifications.');}
   finally{running=false;}
  }
  void update();const timer=setInterval(()=>{if((document.visibilityState==='visible'||soundEnabled.current)&&navigator.onLine)void update();},role==='SAFETY'?5000:15000);
  const focus=()=>void update();window.addEventListener('focus',focus);window.addEventListener('online',focus);
  return()=>{stopped=true;controller.abort();clearInterval(timer);window.removeEventListener('focus',focus);window.removeEventListener('online',focus);};
 },[actorId,role,owner,retry,observe,soundEnabled]);
 async function mark(ids:string[]){
  if(saving||!ids.length)return;setSaving(true);setError('');
  try{
   const response=await fetch('/api/notifications',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({view,ids})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Read status could not be saved.');
   setPackets(current=>({...current,[view]:current[view]?{...current[view]!,items:current[view]!.items.map(item=>ids.includes(item.id)?{...item,read:true}:item)}:undefined}));refresh();
  }catch(cause){setError(cause instanceof Error?cause.message:'Read status could not be saved.');}
  finally{setSaving(false);}
 }
 return <>
  {urgentIds.size>0&&typeof document!=='undefined'&&document.getElementById('staff-notification-alerts')&&createPortal(<div className="notification-emergency" role="alert"><strong>{owner?'Critical platform alerts':'Safety alerts require attention'} · {urgentIds.size}</strong><button className="btn" onClick={()=>{setView(owner?'platform':urgent.some(item=>packets.team?.items.some(team=>team.id===item.id))?'team':'personal');dialog.current?.showModal();}}>Review alerts</button><span>Reading does not acknowledge an emergency. Open an unassigned review to take ownership.</span></div>,document.getElementById('staff-notification-alerts')!)}
  <button className="btn notification-bell" aria-label={`Notifications, ${personalUnread} unread alerts${urgentIds.size?`, ${urgentIds.size} critical alerts`:''}`} onClick={()=>{dialog.current?.showModal();refresh();}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span className="small">Notifications</span>{personalUnread>0&&<span className="notification-count" aria-hidden="true">{personalUnread>99?"99+":personalUnread}</span>}</button>
  <dialog ref={dialog} className="inbox-dialog" aria-labelledby="notification-inbox-title">
   <div className="page-heading"><div><h2 id="notification-inbox-title">Notifications</h2><p className="muted small">Your actions, team intake, and shared updates are separate.</p></div><button className="btn" aria-label="Close notifications" onClick={()=>dialog.current?.close()}>Close</button></div>
   {soundControls}
   <nav className="notification-views" aria-label="Notification views">{views.map(value=><button type="button" key={value} className={`btn ${view===value?'btn-primary':''}`} aria-pressed={view===value} onClick={()=>setView(value)}>{labels[value]} ({(value==='team'?packets[value]?.items.length:packets[value]?.items.filter(item=>!item.read).length)??0})</button>)}</nav>
   <p>{view==='team'?'Shared work waiting for ownership or an eligible decision. Opening a report keeps the claim-or-view choice.':view==='general'?'Shared operational advisories and announcements.':view==='platform'?'Platform incidents requiring owner attention. Routine bookings remain in operational pages.':'Assignments, replies, review updates, and your account security.'}</p>
   <div className="inbox-tools"><button className="btn" disabled={saving||!unread} onClick={()=>void mark((active?.items??[]).filter(item=>!item.read).map(item=>item.id))}>{saving?'Saving…':'Mark this view as read'}</button><button className="btn" onClick={refresh}>Refresh</button></div>
   {error&&<p className="error-message" role="alert">{error}</p>}
   {completionNotice&&<p className="success-message" role="status">{completionNotice}</p>}
   {!active&&!error&&<p role="status">Loading notifications…</p>}
   {active&&!active.items.length&&<p className="empty-state">No notifications in {labels[view].toLowerCase()}.</p>}
   <ul className="inbox-list">{active?.items.map(item=><li key={item.id} className={item.read?'':'unread'}><div>{renderLink(item,<><strong>{item.urgent&&'Urgent · '}{item.title}</strong><span>{item.detail}</span><time dateTime={item.at}>{new Date(item.at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</time></>,()=>dialog.current?.close())}</div><div className="row-actions">{role==='ADMIN'&&item.completion&&<SafetyAlertDone id={item.entityId} version={item.completion.version} onDone={()=>{setCompletionNotice('Safety alert marked as done. The resolution is saved in its history.');setPackets(current=>Object.fromEntries(Object.entries(current).map(([key,packet])=>[key,packet?{...packet,items:packet.items.filter(notice=>notice.entityType!==item.entityType||notice.entityId!==item.entityId)}:packet])));refresh();}}/>}{!item.read&&<button className="btn small" disabled={saving} onClick={()=>void mark([item.id])}>Mark as read</button>}</div></li>)}</ul>
   <p className="muted small">Read status follows your account across devices. Reading does not claim, acknowledge, approve, or resolve work. {active&&`Checked ${new Date(active.checkedAt).toLocaleTimeString('en-PH',{timeZone:'Asia/Manila'})}.`}</p>
  </dialog>
 </>;
}
