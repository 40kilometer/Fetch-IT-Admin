"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { REVIEW_PRIORITIES, REVIEW_STATUSES, reviewLabel } from "@/lib/review-queue";

type Queue = { q: string; status: string; priority?: string; sort: string };
export function QueueFilters({ initial, priorities = false, searchLabel = "Search cases", placeholder = "Title, case ID, or reported facts" }: { initial: Queue; priorities?: boolean; searchLabel?: string; placeholder?: string }) {
  const router = useRouter(), pathname = usePathname(), search = useSearchParams();
  const [q, setQ] = useState(initial.q), [pending, startTransition] = useTransition();
  const [selection,setSelection]=useState({status:initial.status,priority:initial.priority??"",sort:initial.sort});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), params = useRef(new URLSearchParams(search.toString()));
  useEffect(() => { if(!pending && !timer.current){params.current = new URLSearchParams(search.toString());setQ(initial.q);setSelection({status:initial.status,priority:initial.priority??"",sort:initial.sort});} }, [search, initial.q,initial.status,initial.priority,initial.sort,pending]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function navigate(change: Record<string, string>) {
    if (timer.current) clearTimeout(timer.current);timer.current=null;
    const next = new URLSearchParams(params.current);
    // Hidden legacy filters must not affect a queue whose controls no longer expose them.
    for (const key of ["page", "kind", "view", "unanswered"]) next.delete(key);
    if (!priorities) next.delete("priority");
    for (const [key, value] of Object.entries(change)) value ? next.set(key, value) : next.delete(key);
    params.current = next;
    startTransition(() => router.replace(pathname + (next.size ? `?${next}` : ""), { scroll: false }));
  }
  return <form className="card filters queue-filters" aria-label="Queue filters" aria-busy={pending} onSubmit={event => { event.preventDefault(); navigate({ q, status: selection.status, sort: selection.sort }); }}>
    <label className="queue-search">{searchLabel}<input className="input" name="q" value={q} maxLength={100} placeholder={placeholder} onChange={event => { const value = event.target.value; setQ(value); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => navigate({ q: value }), 300); }} /></label>
    <label>Status<select className="input" name="status" value={selection.status} onChange={event => {setSelection({...selection,status:event.target.value});navigate({ status: event.target.value, q });}}>{REVIEW_STATUSES.map(value => <option key={value} value={value}>{reviewLabel(value)}</option>)}</select></label>
    {priorities && <label>Priority<select className="input" name="priority" value={selection.priority} onChange={event => {setSelection({...selection,priority:event.target.value});navigate({ priority: event.target.value, q });}}><option value="">All priorities</option>{REVIEW_PRIORITIES.map(value => <option key={value} value={value}>{reviewLabel(value)}</option>)}</select></label>}
    <label>Sort by<select className="input" name="sort" value={selection.sort} onChange={event => {setSelection({...selection,sort:event.target.value});navigate({ sort: event.target.value, q });}}><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label>
    <div className="filter-actions"><button type="button" className="btn" onClick={() => { setQ("");setSelection({status:"OPEN",priority:"",sort:"oldest"}); navigate({ q: "", status: "OPEN", priority: "", sort: "oldest", team:"",assigned:"" }); }}>Clear filters</button>{pending && <span role="status">Updating results…</span>}</div>
  </form>;
}
