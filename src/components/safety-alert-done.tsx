'use client';
import {useRouter} from 'next/navigation';
import {useRef} from 'react';
import {ConfirmDialog} from './confirm-dialog';

export function SafetyAlertDone({id,version,onDone}:{id:string;version:number;onDone?:()=>void}){
  const router=useRouter(),openedVersion=useRef(version);
  return <ConfirmDialog trigger="Mark as done" title="Mark this safety alert as done?"
    description="Confirm that you have handled this alert. This closes the alert and its linked safety request for the team. Your resolution is saved privately in the audit history; no customer message is sent."
    confirmLabel="Mark as done" reasonLabel="What did you do to resolve this alert?" draftId={`safety-alert-done:${id}`}
    onOpen={()=>{openedVersion.current=version;}}
    onConfirm={async reason=>{
      const response=await fetch(`/api/cases/${encodeURIComponent(id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'complete-alert',version:openedVersion.current,reason})});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'Could not complete this alert. Your resolution note is preserved.');
      onDone?.();router.refresh();
    }}/>;
}
