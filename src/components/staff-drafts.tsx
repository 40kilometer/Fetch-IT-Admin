"use client";
import {createContext,useContext,useEffect,useRef,useState} from "react";
import {draftKey,readDraft,writeDraft,pruneDrafts,type DraftValues,type SavedDraft} from "@/lib/staff-drafts";
export const StaffDraftAccount=createContext<string|null>(null);
const dirty=new Set<string>();
// Account changes must replace cached UI. Text was captured before navigation.
export function allowStaffAccountReload(){dirty.clear();}
export function useStaffDraft(record:string,revision:string,apply:(values:DraftValues)=>void) {
  const account=useContext(StaffDraftAccount),key=account?draftKey(account,record):null;
  const [candidate,setCandidate]=useState<SavedDraft|null>(null),[status,setStatus]=useState("");
  const applyRef=useRef(apply);applyRef.current=apply;
  useEffect(()=>{
    if(!key)return;try{setCandidate(readDraft(localStorage,key));setStatus("");}catch{setStatus("Draft storage is unavailable. Keep this page open to preserve your text.");}
    return ()=>{dirty.delete(key)};
  },[key]);
  function capture(values:DraftValues){
    if(!key)return;dirty.add(key);setCandidate(null);
    try{const saved=writeDraft(localStorage,key,values,revision);if(!saved)dirty.delete(key);setStatus(saved?"Draft saved on this browser. Not submitted.":"");}
    catch{setStatus("Couldn’t save this draft on this browser. Keep this page open.");}
  }
  function clear(){if(!key)return;try{localStorage.removeItem(key);setStatus("");}catch{setStatus("Couldn’t remove the local draft. Retry discarding it when browser storage is available.");}dirty.delete(key);setCandidate(null);}
  function restore(){if(!candidate||!key)return;applyRef.current(candidate.values);dirty.add(key);setStatus("Draft restored. Review it before submitting.");setCandidate(null);}
  return {candidate,status,capture,clear,restore,changed:!!candidate&&candidate.revision!==revision};
}
export function DraftNotice({draft}:{draft:ReturnType<typeof useStaffDraft>}) {
  return <>{draft.candidate?<div className="draft-notice" role="status"><p>A saved draft is available on this browser.{draft.changed&&" This record changed since the draft was saved. Check the current details before submitting."}</p><button className="btn" type="button" onClick={draft.restore}>Restore draft</button><button className="btn" type="button" onClick={draft.clear}>Discard draft</button></div>:draft.status&&<p className="muted small" role="status">{draft.status}</p>}</>;
}
export function StaffDraftGuard(){
  useEffect(()=>{
    try{pruneDrafts(localStorage)}catch{/* Storage failure is reported by each form. */}
    let allowedUntil=0;
    const unload=(event:BeforeUnloadEvent)=>{if(dirty.size&&Date.now()>allowedUntil){event.preventDefault();event.returnValue="";}};
    const click=(event:MouseEvent)=>{if(event.defaultPrevented||!dirty.size||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const link=(event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement|null;if(!link||link.target==='_blank'||link.hasAttribute('download'))return;const url=new URL(link.href);if(url.origin===location.origin&&url.pathname===location.pathname&&url.search===location.search)return;if(!window.confirm("Leave this page with unfinished work? Saved drafts can be restored when you return to this account.")){event.preventDefault();event.stopPropagation();}else allowedUntil=Date.now()+2000;};
    window.addEventListener('beforeunload',unload);document.addEventListener('click',click,true);
    return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',click,true)};
  },[]);return null;
}
