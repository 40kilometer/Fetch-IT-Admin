import { applicationStatusLabel } from "@/lib/workflow-presentation";
import Link from 'next/link';
import { db } from '@/lib/db';

export async function DemoActivityNotice({ since, until }: { since?: Date; until?: Date }) {
  const count = await db.booking.count({ where: { refCode: { startsWith: 'DEMO-' }, ...((since || until) ? { createdAt: { ...(since ? { gte: since } : {}), ...(until ? { lte: until } : {}) } } : {}) } });
  if (!count) return null;
  return <details className="data-note"><summary>About these totals</summary><p>Includes {count.toLocaleString('en-PH')} sample bookings. Quoted fares are not confirmed collections or payouts.</p></details>;
}

const STAGES = [
  ['DRAFT', 'Draft'], ['SUBMITTED', 'Submitted'], ['IN_REVIEW', 'In review'], ['NEEDS_CORRECTION', 'Needs correction'],
  ['RECOMMENDED', 'Recommended'], ['ORIENTATION_SCHEDULED', 'Orientation scheduled'], ['ASSESSED', 'Assessed'], ['ACTIVE', 'Active'],
  ['DEMO_COMPLETED', 'Awaiting activation'], ['FORCE_APPROVAL_PENDING', 'Force approval pending'], ['REJECTED', 'Rejected'],
];
export async function RiderApplicationSummary() {
  const groups = await db.riderApplication.groupBy({ by: ['status'], _count: { _all: true } });
  const counts = new Map(groups.map(g => [g.status, g._count._all]));
  const total = groups.reduce((n, g) => n + g._count._all, 0), max = Math.max(1, ...groups.map(g => g._count._all));
  return <section className="card" aria-labelledby="application-pipeline-title" style={{ padding: 22, marginTop: 22 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 15, flexWrap: 'wrap' }}>
      <div><h2 id="application-pipeline-title" style={{ margin: '0 0 6px', fontSize: 18 }}>Rider application pipeline</h2><p className="muted small" style={{ margin: '0 0 18px' }}>{total} applications · current status across all dates</p></div>
      <Link href="/dashboard/applications">View applications →</Link>
    </div>
    {total ? <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>{STAGES.filter(([status]) => counts.has(status)).map(([status, label]) => {
      const count = counts.get(status) ?? 0;
      return <li key={status} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 160px) minmax(40px, 1fr) 32px', gap: 12, alignItems: 'center', fontSize: 13 }}>
        <span>{applicationStatusLabel(status)}</span><div aria-hidden="true" style={{ height: 10, background: '#edf1ea', borderRadius: 10, overflow: 'hidden' }}><div style={{ height: '100%', width: `${count / max * 100}%`, background: status === 'NEEDS_CORRECTION' ? '#cf8a35' : '#b94c24', borderRadius: 10 }}/></div><strong style={{ textAlign: 'right' }}>{count}</strong>
      </li>;
    })}</ul> : <p className="muted small">New applications will appear here when riders start their application.</p>}
  </section>;
}
