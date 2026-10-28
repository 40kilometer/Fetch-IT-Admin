"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { LogoutButton } from "./logout-button";
import { AdminInbox } from "./admin-inbox";
import { AdminIcon } from "@/components/admin-icon";
import { hasPermission, ROLE_LABELS } from "@/lib/staff-policy";
import { isStaffNavActive, staffNavigation, teamForRole, teamHome } from "@/lib/staff-teams";
import { StaffSessionReturn } from "@/components/staff-demo";
import { isDemoStaffAccount } from "@/lib/staff-demo-roles";
export function AdminShell({ admin, children }: { admin: { id: string; name: string; email: string; role: string; demo?: { controllerName: string; expiresAt: string } | null }; children: React.ReactNode }) {
  const pathname = usePathname(), search = useSearchParams(), router = useRouter(), sidebar = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false), [refreshing, startTransition] = useTransition();
  const operations = hasPermission(admin.role, "operations");
  const groups = staffNavigation(admin.role), ownTeam = teamForRole(admin.role);
  const active = (href: string) => isStaffNavActive(href, pathname, { get: key => search.get(key) ?? (key === "team" && ownTeam ? ownTeam.slug : null) });
  const currentGroup = groups.find(group => group.links.some(link => active(link.href)));
  const currentLink = currentGroup?.links.find(link => active(link.href));
  const section = pathname === "/dashboard/account" ? "My account" : currentLink ? `${currentGroup?.team ? currentGroup.label + " / " : ""}${currentLink.label}` : "Staff portal";
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
      <div className="sidebar-brand-row"><Link href={operations ? "/dashboard" : ownTeam ? teamHome(ownTeam) : "/dashboard/workspace"} className="admin-brand" onClick={() => setOpen(false)}><img src="/fetch-logo-final.png" width="42" height="42" alt="" /><span>Fetch-It<small>STAFF PORTAL</small></span></Link>{open && <button className="btn icon-button mobile-menu" onClick={() => setOpen(false)} aria-label="Close navigation">×</button>}</div>
      {(operations || admin.demo || isDemoStaffAccount(admin)) && <Link href="/staff" className="btn staff-switch-button" onClick={() => setOpen(false)}><AdminIcon name="team" />Switch staff</Link>}
      <nav aria-label="Staff tools">{groups.map(group => {
        const links = group.links.map((link, index) => <Link href={link.href} key={link.href} onClick={() => setOpen(false)} className={`sidebar-link ${active(link.href) ? "active" : ""} ${link.management && !group.links[index - 1]?.management ? "nav-management-start" : ""}`} aria-current={active(link.href) ? "page" : undefined}><AdminIcon name={link.icon} />{link.label}</Link>);
        return <details className="nav-team" key={group.label} open={!operations || currentGroup === group}><summary className={`nav-team-heading ${currentGroup === group ? "is-active" : ""}`}><AdminIcon name={group.icon ?? (group.label === "Operations" ? "overview" : "reports")} /><span>{group.label}</span><span className="nav-chevron" aria-hidden="true">⌄</span></summary><div className="nav-team-links">{links}</div></details>;
      })}</nav>
      <details className="sidebar-account"><summary><span className="account-role">{ROLE_LABELS[admin.role]}</span><span className="muted small">{admin.email}</span></summary><p>{admin.name}</p><Link className="sidebar-link" href="/dashboard/account" onClick={() => setOpen(false)}><AdminIcon name="account" />My account</Link>{admin.demo && <StaffSessionReturn />}<LogoutButton /></details>
    </aside>
    <div className="admin-workspace" inert={open || undefined}><a className="skip-link" href="#main-content">Skip to content</a><header className="admin-header"><div className="header-start"><button className="btn icon-button mobile-menu" aria-label="Open navigation" aria-expanded={open} aria-controls="admin-navigation" onClick={() => setOpen(true)}><AdminIcon name="menu" /></button><span className="header-section">{section}</span></div><div className="header-actions"><button className="btn refresh-dashboard" disabled={refreshing} aria-label={refreshing ? "Refreshing dashboard" : "Refresh dashboard"} onClick={() => startTransition(() => router.refresh())}><AdminIcon name="refresh" /><span>{refreshing ? "Refreshing…" : "Refresh"}</span></button><AdminInbox adminId={admin.id} /><Link className="admin-avatar" href="/dashboard/account" aria-label={`My account: ${admin.name}`}>{admin.name.slice(0, 1).toUpperCase()}</Link></div></header><main id="main-content" tabIndex={-1} className="admin-main">{children}</main><footer className="admin-footer">Fetch-It Staff Portal · Delivery &amp; Ride</footer></div>
  </div>;
}
