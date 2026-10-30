import { AuditEvents } from "@/components/audit-events";
import { AutoFilterForm } from "@/components/auto-filter-form";
import Link from "next/link";
import { requireTeamPage } from "@/lib/staff-team-access";
import { teamHome } from "@/lib/staff-teams";
import { readTeamAudit } from "@/lib/team-audit";
import { humanize, queryLink, queryValue, type SearchParams } from "@/lib/admin-ui";
import { dateBounds } from "@/lib/operations";
import { PageHeader, Pager } from "@/components/admin-ui";

export default async function TeamAuditPage({ params, searchParams }: { params: Promise<{ team: string }>; searchParams: Promise<SearchParams> }) {
  const { team } = await requireTeamPage((await params).team, true), query = await searchParams;
  const filters = { q: queryValue(query, "q").trim().slice(0, 100), from: queryValue(query, "from"), to: queryValue(query, "to"), page: queryValue(query, "page") };
  let error = "";
  try { dateBounds(filters.from, filters.to); } catch (cause) { error = cause instanceof Error ? cause.message : "Choose valid dates."; }
  const { events, total, pages, page } = error ? { events: [], total: 0, pages: 1, page: 1 } : await readTeamAudit(team, filters);
  const base = teamHome(team) + "/audit";
  return <div><PageHeader eyebrow={`${team.label} / Team management`} title={`${team.shortLabel} audit logs`} description={`Recorded actions by current ${team.shortLabel} staff and changes to this team’s records, including actions taken by Admin.`} />
    <AutoFilterForm><label>Search activity<input className="input" name="q" defaultValue={filters.q} placeholder="Staff name, action, or record ID" maxLength={100} /></label><label>From date<input className="input" name="from" type="date" defaultValue={filters.from} /></label><label>To date<input className="input" name="to" type="date" defaultValue={filters.to} /></label><div className="filter-actions"><Link className="btn" href={base}>Clear filters</Link></div></AutoFilterForm>
    {error && <p className="error-message" role="alert">{error}</p>}
    {await AuditEvents({events})}
    {!events.length && !error && <p className="card empty-state">No {team.shortLabel} activity matches these filters.</p>}
    <Pager page={page} pages={pages} total={total} noun="recorded actions" href={next => queryLink(base, filters, next)} />
  </div>;
}
