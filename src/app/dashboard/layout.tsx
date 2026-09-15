import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminSession } from "@/lib/session";
import { LogoutButton } from "./logout-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside style={{ width: 220, borderRight: "1px solid var(--border)", padding: 20, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--orange)", display: "grid", placeItems: "center", color: "white", fontWeight: 700, fontSize: 14 }}>
            F
          </div>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Fetch-It Admin</span>
        </div>
        <Link href="/dashboard" className="sidebar-link">Overview</Link>
        <Link href="/dashboard/bookings" className="sidebar-link">Bookings</Link>
        <Link href="/dashboard/riders" className="sidebar-link">Riders</Link>
        <Link href="/dashboard/customers" className="sidebar-link">Customers</Link>
        <div style={{ marginTop: "auto", paddingTop: 20, borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>{session.name}</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 12px" }}>{session.email}</p>
          <LogoutButton />
        </div>
      </aside>
      <main style={{ flex: 1, padding: 32, maxWidth: 1100 }}>{children}</main>
    </div>
  );
}
