"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
type Item = { id: string; title: string; detail: string; at: string; href: string };
export function AdminInbox({ adminId }: { adminId: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [read, setRead] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState("");
  const [retry, setRetry] = useState(0);
  const key = `fetchit-admin:${adminId}:read-notifications`;
  useEffect(() => {
    try { const value = JSON.parse(localStorage.getItem(key) ?? "[]"); setRead(Array.isArray(value) ? value.filter(v => typeof v === "string") : []); } catch { setRead([]); }
    let stopped = false, running = false;
    async function refresh() {
      if (running || stopped) return;
      running = true;
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        if (!response.ok) throw new Error(response.status === 401 ? "Your session has expired. Sign in again." : "Notifications are unavailable. Please retry.");
        const data = await response.json();
        if (!Array.isArray(data.items)) throw new Error("Notifications are unavailable. Please retry.");
        if (!stopped) { setItems(data.items); setChecked(data.checkedAt); setError(""); }
      } catch (e) { if (!stopped) setError(e instanceof Error ? e.message : "Couldn’t refresh notifications."); }
      finally { running = false; }
    }
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 30000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus); window.addEventListener("online", focus);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener("focus", focus); window.removeEventListener("online", focus); };
  }, [key, retry]);
  function mark(ids: string[]) {
    const next = [...new Set([...ids, ...read])].slice(0, 1000);
    setRead(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Reading still works when storage is unavailable. */ }
  }
  const unread = items.filter(item => !read.includes(item.id)).length;
  return <>
    <button className="btn icon-button notification-bell" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} onClick={() => dialog.current?.showModal()}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {unread > 0 && <span className="notification-count" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
    </button>
    <dialog ref={dialog} className="inbox-dialog" aria-labelledby="inbox-title">
      <div className="page-heading"><div><h2 id="inbox-title">Notifications</h2><p className="muted small">Latest 100 updates from the past seven days.</p></div><button className="btn icon-button" aria-label="Close notifications" onClick={() => dialog.current?.close()}>✕</button></div>
      <div className="inbox-tools"><button className="btn" disabled={!unread} onClick={() => mark(items.map(item => item.id))}>Mark all as read</button><button className="btn" onClick={() => setRetry(v => v + 1)}>Refresh inbox</button></div>
      {error && <p className="error-message" role="alert">{error}{error.includes("Sign in") && <> <a href="/login">Sign in</a></>}</p>}
      {!items.length && !error && <p className="empty-state">{checked ? "No recent notifications." : "Loading notifications…"}</p>}
      <ul className="inbox-list">{items.map(item => <li key={item.id}><button className={`inbox-item ${read.includes(item.id) ? "" : "unread"}`} onClick={() => { mark([item.id]); dialog.current?.close(); router.push(item.href); }}><span className="inbox-item-title">{item.title}{!read.includes(item.id) && <span className="unread-dot" aria-label="Unread" />}</span><span>{item.detail}</span><time className="muted small" dateTime={item.at}>{new Date(item.at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</time></button></li>)}</ul>
      <p className="muted small">Read status is saved on this device. {checked && `Checked ${new Date(checked).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila" })}.`}</p>
    </dialog>
  </>;
}
