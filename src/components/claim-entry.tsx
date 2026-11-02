"use client";
import Link from 'next/link';
import {useId,useRef,useState,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {confirmStaffNavigation,allowStaffAccountReload} from './staff-drafts';
type Props={href:string;endpoint:string;revision:string;kind:'support'|'case'|'application';claimable:boolean;children:ReactNode;className?:string;id?:string;button?:boolean;onClaimed?:()=>void;onNavigate?:()=>void;recordLabel?:string};
export function ClaimEntry({href,endpoint,revision,kind,claimable,children,className,id,button=false,onClaimed,onNavigate,recordLabel}:Props){
 const dialog=useRef<HTMLDialogElement>(null),pending=useRef(false),title=useId(),router=useRouter();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function open(){if(pending.current||dialog.current?.open)return;if(await confirmStaffNavigation('Open this request with unfinished work?')){setError('');dialog.current?.showModal();}}
 async function claim(){
  if(pending.current)return;pending.current=true;setBusy(true);setError('');
  try{
   const response=await fetch(endpoint,{method:kind==='application'?'POST':'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'claim',...(kind==='support'?{updatedAt:revision}:{version:Number(revision)})})});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Could not claim this request. Refresh and try again.');
   dialog.current?.close();
   if(button){onClaimed?.();router.refresh();}else{onNavigate?.();allowStaffAccountReload();window.location.assign(href);}
  }catch(cause){setError(cause instanceof Error?cause.message:'Could not claim this request. Please retry.');}
  finally{pending.current=false;setBusy(false);}
 }
 if(!claimable&&!button)return <Link href={href} className={className} id={id}>{children}</Link>;
 return <>{button?<button type="button" className={className??'btn btn-primary'} onClick={()=>void open()}>{children}</button>:<Link href={href} className={className} id={id} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();void open();}}>{children}</Link>}
 <dialog ref={dialog} className="inbox-dialog" aria-labelledby={title} onCancel={event=>{if(pending.current)event.preventDefault();}}><h2 id={title}>Claim this {kind==='case'?'review':kind==='application'?'application':'request'}?</h2>{recordLabel&&<p><strong>{recordLabel}</strong></p>}<p>{kind==='support'?'Claiming assigns this request to you and immediately marks it In review. Your name will appear as its owner.':'Claiming assigns this review to you and starts your review. Later approval stages remain unchanged.'}</p><p className="muted small">View only opens the record without claiming it. Claiming is recorded in the audit log.</p>{error&&<p className="error-message" role="alert">{error}</p>}<div className="staff-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={()=>void claim()}>{busy?'Claiming…':'Claim & start review'}</button><button type="button" className="btn" disabled={busy} onClick={()=>{dialog.current?.close();if(!button){onNavigate?.();router.push(href);}}}>View only</button><button type="button" className="btn" disabled={busy} onClick={()=>dialog.current?.close()}>Cancel</button></div></dialog></>;
}
