'use client';
import {useEffect} from 'react';
import {usePathname,useRouter,useSearchParams} from 'next/navigation';

// Keep links from older notifications in their receiving team's navigation.
export function CaseNavigation({kind}:{kind:string}){
  const router=useRouter(),pathname=usePathname(),search=useSearchParams();
  const team=kind==='SAFETY'?'safety':kind==='ESCALATION'?'customer-support':'';
  useEffect(()=>{if(team&&search.get('team')!==team){const next=new URLSearchParams(search.toString());next.set('team',team);router.replace(`${pathname}?${next}`,{scroll:false});}},[team,search,pathname,router]);
  return null;
}
