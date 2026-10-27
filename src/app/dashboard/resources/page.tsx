import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaffPage } from "@/lib/staff-access";
import { hasPermission } from "@/lib/staff-policy";
import { humanize, queryLink, queryValue, type SearchParams } from "@/lib/admin-ui";
import { PAGE_SIZE, pageNumber } from "@/lib/operations";
import { ActionForm } from "@/components/action-form";
import { PageHeader, Pager } from "@/components/admin-ui";
import { notFound, redirect } from "next/navigation";
import { teamBySlug, teamForRole } from "@/lib/staff-teams";
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaffPage(), query = await searchParams, q = queryValue(query, "q").trim().slice(0, 100);
  const requestedTeam = queryValue(query, "team"), ownTeam = teamForRole(staff.role);
  if (requestedTeam && !teamBySlug(requestedTeam)) notFound();
  if (ownTeam && requestedTeam && requestedTeam !== ownTeam.slug) redirect(`/dashboard/resources?team=${ownTeam.slug}`);
  const team = ownTeam ?? teamBySlug(requestedTeam);
  const kinds = team ? [...team.resourceKinds] : ["KNOWLEDGE", "TEMPLATE", "ANNOUNCEMENT", "SAFETY_GUIDE"];
  const kind = queryValue(query, "kind"), where = { kind: { in: kinds.includes(kind) ? [kind] : kinds }, ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { body: { contains: q, mode: "insensitive" as const } }] } : {}) };
  const total = await db.staffResource.count({ where }), pages = Math.max(1, Math.ceil(total / PAGE_SIZE)), page = Math.min(pageNumber(queryValue(query, "page")), pages);
  const records = await db.staffResource.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE });
  return <div><PageHeader eyebrow={team?.label ?? "Team resources"} title="Knowledge & updates" description="Find guidance, reply templates, and team updates. Shared announcements are available to every team." /><form key={q + ":" + kind} className="card filters directory-filters">{team && <input type="hidden" name="team" value={team.slug} />}<label>Search resources<input className="input" name="q" defaultValue={q} maxLength={100} /></label><label>Resource type<select name="kind" className="input" defaultValue={kind}><option value="">All accessible resources</option>{kinds.map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select></label><div className="filter-actions"><button className="btn btn-primary">Search</button><Link className="btn" href={queryLink("/dashboard/resources", { team: team?.slug })}>Clear filters</Link></div></form><div className="ticket-list">{records.map(r => <article className="card conversation" key={r.id}><div className="eyebrow">{humanize(r.kind)}</div><h2>{r.title}</h2><p className="preserve-lines">{r.body}</p><time className="muted small" dateTime={r.updatedAt.toISOString()}>Updated {r.updatedAt.toLocaleString("en-PH", { timeZone: "Asia/Manila" })} · Philippine time</time></article>)}</div>{!records.length && <p className="card empty-state">No resources match these filters.</p>}<Pager page={page} pages={pages} total={total} noun="resources" href={next => queryLink("/dashboard/resources", { q, kind, team: team?.slug }, next)} />
    {hasPermission(staff.role, "resources.edit") && <details className="section-block"><summary className="btn">Publish a resource</summary><ActionForm url="/api/resources" label="Publish resource" hidden={team ? { team: team.slug } : {}} fields={[{ name: "kind", label: "Resource type", options: (hasPermission(staff.role, "operations") ? kinds : ["KNOWLEDGE", "TEMPLATE"]).map(value => ({ value, label: humanize(value) })) }, { name: "title", label: "Title", required: true }, { name: "body", label: "Content", type: "textarea", required: true }]} /></details>}</div>;
}
