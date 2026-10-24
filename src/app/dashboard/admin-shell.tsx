"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { LogoutButton } from "./logout-button";
import { AdminInbox } from "./admin-inbox";
import { AdminIcon } from "@/components/admin-icon";
import { hasPermission, ROLE_LABELS } from "@/lib/staff-policy";
type Item = [href: string, label: string, icon: string];
export function AdminShell({ admin, children }: { admin: { id: string; name: string; email: string; role: string }; children: React.ReactNode }) {
  const pathname = usePathname(), router = useRouter(), sidebar = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false), [refreshing, startTransition] = useTransition();
  const operations = hasPermission(admin.role, "operations");
  const groups: { label: string; links: Item[] }[] = [
    { label: "Operations", links: [...(operations ? [["/dashboard", "Overview", "overview"], ["/dashboard/bookings", "Bookings", "bookings"], ["/dashboard/riders", "Riders", "riders"], ["/dashboard/customers", "Customers", "users"]] as Item[] : []), ...(hasPermission(admin.role, "finance") ? [["/dashboard/finance", "Payment records", "finance"]] as Item[] : [])] },
    { label: "Team work", links: [["/dashboard/workspace", "My workspace", "workspace"], ...(hasPermission(admin.role, "support") ? [["/dashboard/support", "Support inbox", "support"], ...(!operations ? [["/dashboard/lookup", "Booking lookup", "lookup"]] : [])] as Item[] : []), ...(hasPermission(admin.role, "support.manage") ? [["/dashboard/team", "Support workload", "team"]] as Item[] : []), ...(hasPermission(admin.role, "safety") ? [["/dashboard/applications", "Rider applications", "users"]] as Item[] : []), ["/dashboard/cases", "Reviews & escalations", "cases"], ["/dashboard/resources", "Knowledge & updates", "resources"]] },
    { label: "Reporting", links: operations ? [["/dashboard/reports", "Reports", "reports"], ["/dashboard/audit", "Audit log", "audit"]] : [] },
  ];
  const active = (href: string) => href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  const section = pathname === "/dashboard/account" ? "My account" : groups.flatMap(g => g.links).find(([href]) => active(href))?.[1] ?? "Staff portal";
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(sidebar.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), summary, [tabindex="0"]') ?? []).filter(element => element.getClientRects().length);
    focusable()[0]?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "Tab") {
        const nodes = focusable(), first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    const media = window.matchMedia("(min-width: 761px)"), resize = () => { if (media.matches) setOpen(false); };
    window.addEventListener("keydown", keydown); media.addEventListener("change", resize);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", keydown); media.removeEventListener("change", resize); previous?.focus(); };
  }, [open]);
  return <div className="admin-shell">{open && <button className="sidebar-backdrop" aria-label="Close navigation" tabIndex={-1} onClick={() => setOpen(false)} />}
    <aside ref={sidebar} className={`admin-sidebar ${open ? "is-open" : ""}`} id="admin-navigation" role={open ? "dialog" : undefined} aria-modal={open || undefined} aria-label="Staff navigation">
      <div className="sidebar-brand-row"><Link href={operations ? "/dashboard" : "/dashboard/workspace"} className="admin-brand" onClick={() => setOpen(false)}><img src="/fetch-logo-final.png" width="42" height="42" alt="" /><span>Fetch-It<small>STAFF PORTAL</small></span></Link>{open && <button className="btn icon-button mobile-menu" onClick={() => setOpen(false)} aria-label="Close navigation">×</button>}</div>
      <nav aria-label="Staff tools">{groups.filter(group => group.links.length).map(group => <div className="nav-group" key={group.label}><p className="nav-group-label">{group.label}</p>{group.links.map(([href, label, icon]) => <Link href={href} key={href} onClick={() => setOpen(false)} className={`sidebar-link ${active(href) ? "active" : ""}`} aria-current={active(href) ? "page" : undefined}><AdminIcon name={icon} />{label}</Link>)}</div>)}</nav>
      <details className="sidebar-account"><summary><span className="account-name">{admin.name}</span><span className="muted small">{ROLE_LABELS[admin.role]}</span></summary><p>{admin.email}</p><Link className="sidebar-link" href="/dashboard/account" onClick={() => setOpen(false)}><AdminIcon name="account" />My account</Link><LogoutButton /></details>
    </aside>
    <div className="admin-workspace" inert={open || undefined}><a className="skip-link" href="#main-content">Skip to content</a><header className="admin-header"><div className="header-start"><button className="btn icon-button mobile-menu" aria-label="Open navigation" aria-expanded={open} aria-controls="admin-navigation" onClick={() => setOpen(true)}><AdminIcon name="menu" /></button><span className="header-section">{section}</span></div><div className="header-actions"><button className="btn refresh-dashboard" disabled={refreshing} aria-label={refreshing ? "Refreshing dashboard" : "Refresh dashboard"} onClick={() => startTransition(() => router.refresh())}><AdminIcon name="refresh" /><span>{refreshing ? "Refreshing…" : "Refresh"}</span></button><AdminInbox adminId={admin.id} /><Link className="admin-avatar" href="/dashboard/account" aria-label={`My account: ${admin.name}`}>{admin.name.slice(0, 1).toUpperCase()}</Link></div></header><main id="main-content" tabIndex={-1} className="admin-main">{children}</main><footer className="admin-footer">Fetch-It Staff Portal · Delivery &amp; Ride</footer></div>
  </div>;
}
