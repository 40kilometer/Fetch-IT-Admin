import Link from "next/link";
import { db } from "@/lib/db";
import { VEHICLE_LABEL } from "@/lib/constants";
import { BanButton } from "../ban-button";

export default async function RidersPage() {
  const riders = await db.user.findMany({
    where: { role: "RIDER" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, email: true, phone: true,
      riderProfile: true, riderPresence: true, isBanned: true, banReason: true,
    },
  });

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 20 }}>Riders</h1>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Vehicle</th>
              <th>Rating</th>
              <th>Deliveries</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {riders.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 500 }}><Link href={`/dashboard/riders/${r.id}`}>{r.name} →</Link></td>
                <td>
                  <div>{r.email}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 13 }}>{r.phone ?? "—"}</div>
                </td>
                <td>
                  {r.riderProfile?.vehicleClass ? VEHICLE_LABEL[r.riderProfile?.vehicleClass] ?? r.riderProfile?.vehicleClass : "—"}
                  {r.riderProfile?.vehiclePlate && <span style={{ color: "var(--text-muted)" }}> · {r.riderProfile?.vehiclePlate}</span>}
                </td>
                <td>★ {(r.riderProfile?.rating ?? 5).toFixed(1)}</td>
                <td>{r.riderProfile?.totalDeliveries}</td>
                <td>
                  {r.isBanned ? (
                    <span className="badge badge-red" title={r.banReason ?? undefined}>Restricted</span>
                  ) : (
                    <span className={`badge ${r.riderPresence?.isOnline ? "badge-green" : "badge-gray"}`}>
                      {r.riderPresence?.isOnline ? "Online" : "Offline"}
                    </span>
                  )}
                </td>
                <td><BanButton userId={r.id} isBanned={r.isBanned} /></td>
              </tr>
            ))}
            {riders.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)", padding: 32 }}>No riders yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
