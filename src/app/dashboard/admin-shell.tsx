"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { LogoutButton } from "./logout-button";
import { AdminInbox } from "./admin-inbox";
const links = [["/dashboard", "Overview", "◈"], ["/dashboard/bookings", "Bookings", "▤"], ["/dashboard/riders", "Riders", "↗"], ["/dashboard/customers", "Customers", "◎"], ["/dashboard/support", "Customer support", "◌"], ["/dashboard/reports", "Reports", "▥"], ["/dashboard/audit", "Audit log", "◷"]];
export function AdminShell({ admin, children }: { admin: { id: string; name: string; email: string }; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [refreshing, startTransition] = useTransition();
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; window.addEventListener("keydown", escape); return () => window.removeEventListener("keydown", escape); }, []);
  const section = links.find(([href]) => href === "/dashboard" ? pathname === href : pathname.startsWith(href))?.[1] ?? "Admin";
  return <div className="admin-shell">
    {open && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <aside className={`admin-sidebar ${open ? "is-open" : ""}`} id="admin-navigation">
      <Link href="/dashboard" className="admin-brand" onClick={() => setOpen(false)}><img src="/fetch-logo-final.png" width="42" height="42" alt="" /><span>Fetch-It<small>OPERATIONS</small></span></Link>
      <nav aria-label="Admin navigation">{links.map(([href, label, icon]) => <Link href={href} key={href} onClick={() => setOpen(false)} className={`sidebar-link ${section === label ? "active" : ""}`} aria-current={section === label ? "page" : undefined}><span aria-hidden="true">{icon}</span>{label}</Link>)}</nav>
      <div className="sidebar-account"><strong>{admin.name}</strong><p>{admin.email}</p><LogoutButton /></div>
    </aside>
    <div className="admin-workspace"><header className="admin-header"><div className="header-start"><button className="btn icon-button mobile-menu" aria-label="Open navigation" aria-expanded={open} aria-controls="admin-navigation" onClick={() => setOpen(v => !v)}>☰</button><span className="header-section">{section}</span></div><div className="header-actions"><button className="btn refresh-dashboard" disabled={refreshing} onClick={() => startTransition(() => router.refresh())}>↻ <span>{refreshing ? "Refreshing…" : "Refresh"}</span></button><AdminInbox adminId={admin.id} /><span className="admin-avatar" title={admin.name}>{admin.name.slice(0, 1).toUpperCase()}</span></div></header><main className="admin-main">{children}</main><footer className="admin-footer">Fetch-It Operations · Delivery &amp; Ride</footer></div>
  </div>;
}
