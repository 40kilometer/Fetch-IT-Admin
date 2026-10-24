import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-access";
import { accountWhere, queryLink, queryValue, type SearchParams } from "@/lib/admin-ui";
import { PAGE_SIZE, pageNumber } from "@/lib/operations";
import { VEHICLE_LABEL } from "@/lib/constants";
import { BanButton } from "@/app/dashboard/ban-button";
import { PageHeader, Pager } from "./admin-ui";
export async function AccountDirectory({ role, query }: { role: "CUSTOMER" | "RIDER"; query: SearchParams }) {
  await requireAdminPage();
  const rider = role === "RIDER", noun = rider ? "riders" : "customers", base = `/dashboard/${noun}`;
  const q = queryValue(query, "q").trim().slice(0, 100), status = queryValue(query, "status");
  const where = accountWhere(role, q, status);
  const total = await db.user.count({ where }), pages = Math.max(1, Math.ceil(total / PAGE_SIZE)), page = Math.min(pageNumber(queryValue(query, "page")), pages);
  const accounts = await db.user.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
    select: { id: true, name: true, email: true, phone: true, createdAt: true, isBanned: true, banReason: true, riderProfile: true, riderPresence: true, _count: { select: { bookingsAsCustomer: true, bookingsAsRider: true, reviewsAsRider: true } } } });
  return <div><PageHeader eyebrow="Account management" title={rider ? "Riders" : "Customers"} description={`Find ${noun}, review their history, and manage account access.`} />
    <form key={q + ":" + status} className="card filters directory-filters"><label>Search {noun}<input className="input" name="q" defaultValue={q} maxLength={100} placeholder="Name, email, or phone" /></label><label>Account status<select className="input" name="status" defaultValue={status}><option value="">All accounts</option><option value="active">Unrestricted</option><option value="restricted">Restricted</option>{rider && <><option value="online">Online</option><option value="offline">Offline</option></>}</select></label><div className="filter-actions"><button className="btn btn-primary">Search</button><Link className="btn" href={base}>Clear filters</Link></div></form>
    <div className="card table-card"><table className="responsive-table"><thead><tr><th>Name</th><th>Contact</th><th>{rider ? "Vehicle / rating" : "Bookings"}</th><th>{rider ? "Assigned bookings" : "Joined"}</th><th>Status</th><th>Actions</th></tr></thead><tbody>{accounts.map(account => <tr key={account.id}><td data-label="Name"><Link className="text-link" href={`${base}/${account.id}`}>{account.name}</Link></td><td data-label="Contact">{account.email}<div className="muted small">{account.phone ?? "No phone supplied"}</div></td><td data-label={rider ? "Vehicle / rating" : "Bookings"}>{rider ? <>{VEHICLE_LABEL[account.riderProfile?.vehicleClass ?? ""] ?? "Vehicle not set"}<div className="muted small">{account.riderProfile?.vehiclePlate ?? "No plate"} · {account._count.reviewsAsRider ? `★ ${account.riderProfile?.rating.toFixed(1) ?? "—"}` : "Not rated"}</div></> : account._count.bookingsAsCustomer}</td><td data-label={rider ? "Assigned bookings" : "Joined"}>{rider ? account._count.bookingsAsRider : account.createdAt.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}</td><td data-label="Status"><span className={`badge badge-${account.isBanned ? "red" : rider && account.riderPresence?.isOnline ? "green" : "gray"}`}>{account.isBanned ? "Restricted" : rider ? account.riderPresence?.isOnline ? "Online" : "Offline" : "Active"}</span>{account.banReason && <p className="small restriction-reason">{account.banReason}</p>}</td><td data-label="Actions"><div className="row-actions"><Link className="btn" href={`${base}/${account.id}`}>View profile</Link><BanButton userId={account.id} name={account.name} isBanned={account.isBanned} /></div></td></tr>)}</tbody></table>{!accounts.length && <div className="empty-state">No {noun} match these filters. <Link className="text-link" href={base}>Clear filters</Link></div>}</div>
    <Pager page={page} pages={pages} total={total} noun={noun} href={next => queryLink(base, { q, status }, next)} />
  </div>;
}
