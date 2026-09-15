import { db } from "@/lib/db";
import { BanButton } from "../ban-button";

export default async function CustomersPage() {
  const customers = await db.user.findMany({
    where: { role: "CUSTOMER" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, email: true, phone: true, createdAt: true,
      isBanned: true, banReason: true,
      _count: { select: { bookingsAsCustomer: true } },
    },
  });

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 20 }}>Customers</h1>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Bookings</th>
              <th>Joined</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 500 }}>{c.name}</td>
                <td>
                  <div>{c.email}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 13 }}>{c.phone ?? "—"}</div>
                </td>
                <td>{c._count.bookingsAsCustomer}</td>
                <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                <td>
                  {c.isBanned ? (
                    <span className="badge badge-red" title={c.banReason ?? undefined}>Restricted</span>
                  ) : (
                    <span className="badge badge-gray">Active</span>
                  )}
                </td>
                <td><BanButton userId={c.id} isBanned={c.isBanned} /></td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)", padding: 32 }}>No customers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
