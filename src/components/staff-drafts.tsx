"use client";
import {createContext,useContext,useEffect,useRef,useState} from "react";
import {draftKey,readDraft,writeDraft,pruneDrafts,type DraftValues,type SavedDraft} from "@/lib/staff-drafts";
export const StaffDraftAccount=createContext<string|null>(null);
const dirty=new Map<string,string[]>();
const changes=()=>[...new Set([...dirty.values()].flat())];
let askToLeave:((message:string)=>Promise<boolean>)|undefined;
// Account changes must replace cached UI. Values were captured before navigation.
export function allowStaffAccountReload(){dirty.clear();}
export async function confirmStaffNavigation(message="Leave this page with unfinished work?") {
  if(!dirty.size)return true;
  return askToLeave?askToLeave(message):window.confirm(`${message}\nUnsaved: ${changes().join(", ")}. Saved drafts can be restored on this browser.`);
}
type DraftOptions={baseline:DraftValues;labels:Record<string,string>};
export function useStaffDraft(record:string,revision:string,apply:(values:DraftValues)=>void,options?:DraftOptions) {
  const account=useContext(StaffDraftAccount),key=account&&record?draftKey(account,record):null;
  const [candidate,setCandidate]=useState<SavedDraft|null>(null),[status,setStatus]=useState("");
  const applyRef=useRef(apply);applyRef.current=apply;
  const baseline=useRef(options?.baseline),labels=options?.labels;
  const names=(values:DraftValues)=>Object.keys(values).filter(name=>options?values[name]!==String(baseline.current?.[name]??""):!!values[name].trim()).map(name=>labels?.[name]??name.replace(/([A-Z])/g," $1"));
  useEffect(()=>{
    baseline.current=options?.baseline;
    if(!key)return;try{setCandidate(readDraft(localStorage,key));setStatus("");}catch{setStatus("Draft storage is unavailable. Keep this page open to preserve your work.");}
    return ()=>{dirty.delete(key)};
  },[key]);
  function capture(values:DraftValues){
    if(!key)return;const changed=names(values);setCandidate(null);
    if(changed.length)dirty.set(key,changed);else dirty.delete(key);
    try{
      const saved=changed.length?writeDraft(localStorage,key,values,revision,Date.now(),!!options):(localStorage.removeItem(key),null);
      setStatus(saved?`Unsaved: ${changed.join(", ")}. Draft saved on this browser. Not submitted.`:"");
    }catch{setStatus(`Unsaved: ${changed.join(", ")}. Couldn’t save this draft on this browser. Keep this page open.`);}
  }
  function clear(nextBaseline?:DraftValues){if(nextBaseline)baseline.current=nextBaseline;if(!key)return;try{localStorage.removeItem(key);setStatus("");}catch{setStatus("Couldn’t remove the local draft. Retry discarding it when browser storage is available.");}dirty.delete(key);setCandidate(null);}
  function restore(){if(!candidate||!key)return;applyRef.current(candidate.values);const changed=names(candidate.values);if(changed.length)dirty.set(key,changed);setStatus(`Draft restored. Review it before submitting.${changed.length?` Unsaved: ${changed.join(", ")}.`:""}`);setCandidate(null);}
  return {candidate,status,capture,clear,restore,changed:!!candidate&&candidate.revision!==revision};
}
export function DraftNotice({draft}:{draft:ReturnType<typeof useStaffDraft>}) {
  return <>{draft.candidate?<div className="draft-notice" role="status"><p>A saved draft is available on this browser.{draft.changed&&" This record changed since the draft was saved. Check the current details and selections before submitting."}</p><button className="btn" type="button" onClick={draft.restore}>Restore draft</button><button className="btn" type="button" onClick={()=>draft.clear()}>Discard draft</button></div>:draft.status&&<p className="muted small" role="status">{draft.status}</p>}</>;
}
type StaffNavigateEvent=Event&{navigationType:string;hashChange:boolean;destination:{url:string;key:string;sameDocument:boolean}};
type StaffNavigation={addEventListener(type:string,listener:(event:StaffNavigateEvent)=>void):void;removeEventListener(type:string,listener:(event:StaffNavigateEvent)=>void):void;traverseTo(key:string):{finished:Promise<unknown>}};
export function StaffDraftGuard(){
  const dialog=useRef<HTMLDialogElement>(null),resolve=useRef<((value:boolean)=>void)|null>(null);
  const [prompt,setPrompt]=useState<{message:string;fields:string[]}|null>(null);
  const allowedUntil=useRef(0);
  const finish=(leave:boolean)=>{if(leave)allowedUntil.current=Date.now()+2000;const callback=resolve.current;resolve.current=null;dialog.current?.close();setPrompt(null);callback?.(leave);};
  useEffect(()=>{if(prompt)dialog.current?.showModal();},[prompt]);
  useEffect(()=>{
    try{pruneDrafts(localStorage)}catch{/* Storage failure is reported by each form. */}
    const ask=(message:string)=>{if(resolve.current)return Promise.resolve(false);return new Promise<boolean>(done=>{resolve.current=done;setPrompt({message,fields:changes()});});};
    askToLeave=ask;
    const unload=(event:BeforeUnloadEvent)=>{if(dirty.size&&Date.now()>allowedUntil.current){event.preventDefault();event.returnValue="";}};
    const click=(event:MouseEvent)=>{
      if(event.defaultPrevented||!dirty.size||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      const link=(event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement|null;
      if(!link||link.target==='_blank'||link.hasAttribute('download'))return;
      const url=new URL(link.href);if(!/^https?:$/.test(url.protocol)||url.origin===location.origin&&url.pathname===location.pathname&&url.search===location.search)return;
      event.preventDefault();event.stopPropagation();
      void ask("Leave this page with unfinished work?").then(leave=>{if(leave)window.location.assign(link.href);});
    };
    // Use browser cancellation without fake history entries or rewriting Next's
    // history state. Non-cancelable traversals retain recoverable drafts.
    const navigation=(window as unknown as {navigation?:StaffNavigation}).navigation;
    let permittedKey="";
    const traverse=(event:StaffNavigateEvent)=>{
      if(event.navigationType!=="traverse"||event.hashChange||!event.destination.sameDocument||!event.cancelable||!dirty.size)return;
      if(permittedKey===event.destination.key){permittedKey="";return;}
      event.preventDefault();
      void ask("Go back or forward with unfinished work?").then(leave=>{if(leave&&navigation){permittedKey=event.destination.key;void navigation.traverseTo(permittedKey).finished.catch(()=>{permittedKey="";});}});
    };
    window.addEventListener('beforeunload',unload);document.addEventListener('click',click,true);navigation?.addEventListener('navigate',traverse);
    return()=>{if(askToLeave===ask)askToLeave=undefined;resolve.current?.(false);resolve.current=null;window.removeEventListener('beforeunload',unload);document.removeEventListener('click',click,true);navigation?.removeEventListener('navigate',traverse);};
  },[]);
  return <dialog ref={dialog} className="inbox-dialog" aria-labelledby="unsaved-work-title" onCancel={event=>{event.preventDefault();finish(false);}} onClose={()=>{if(resolve.current)finish(false);}}><h2 id="unsaved-work-title">Unsaved changes</h2><p>{prompt?.message}</p><ul>{prompt?.fields.map(field=><li key={field}>{field}</li>)}</ul><p>These changes have not been submitted. Saved drafts can be restored when you return to this account on this browser.</p><div className="staff-actions"><button autoFocus type="button" className="btn btn-primary" onClick={()=>finish(false)}>Stay here</button><button type="button" className="btn" onClick={()=>finish(true)}>Continue</button></div></dialog>;
}
