"use client";
import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
export function AutoFilterForm({children, className="card filters"}:{children:React.ReactNode;className?:string}) {
  const router=useRouter(),pathname=usePathname(),search=useSearchParams(),[pending,startTransition]=useTransition();
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const formRef=useRef<HTMLFormElement>(null);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current)},[]);
  useEffect(()=>{for(const control of Array.from(formRef.current?.elements??[]))if((control instanceof HTMLInputElement||control instanceof HTMLSelectElement)&&control.name&&document.activeElement!==control)control.value=search.get(control.name)??""},[search]);
  function update(form:HTMLFormElement,delay=0){
    if(timer.current)clearTimeout(timer.current);
    const params=new URLSearchParams();
    for(const [key,value] of new FormData(form))if(typeof value==='string'&&value.trim())params.set(key,value.trim());
    timer.current=setTimeout(()=>startTransition(()=>router.replace(pathname+(params.size?`?${params}`:""),{scroll:false})),delay);
  }
  return <form ref={formRef} className={className} aria-label="Filters" aria-busy={pending} onChange={e=>update(e.currentTarget,e.target instanceof HTMLInputElement&&e.target.type==='text'?300:0)} onSubmit={e=>{e.preventDefault();update(e.currentTarget)}}>{children}<div className="active-filters">{[...search.entries()].filter(([key])=>key!=="page").map(([key,value])=><button type="button" className="filter-chip" key={key} aria-label={`Remove ${key} filter`} onClick={()=>{const next=new URLSearchParams(search.toString());next.delete(key);next.delete('page');startTransition(()=>router.replace(pathname+(next.size?`?${next}`:""),{scroll:false}))}}>{key}: {value.replaceAll('_',' ').toLowerCase()} ×</button>)}</div><p className="filter-feedback" role="status">{pending?"Updating results…":"Filters update automatically"}</p></form>;
}
