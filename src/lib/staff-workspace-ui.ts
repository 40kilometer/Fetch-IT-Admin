export const staffLandingPath = (role: string) => role === 'ADMIN' ? '/dashboard/bookings' : role === 'SAFETY' ? '/dashboard/teams/safety' : role === 'SUPPORT' || role === 'SUPPORT_SUPERVISOR' ? '/dashboard/teams/customer-support' : '/dashboard/workspace';

export function bookingStatusLabel(status: string, type?: string) {
  return status === 'DELIVERED' ? type === 'RIDE' ? 'Completed' : type === 'DELIVERY' ? 'Delivered' : 'Completed / delivered' : null;
}

export const SUPPORT_VIEWS = [['unassigned','Unassigned'],['mine','Mine'],['awaiting','Awaiting reply'],['escalated','Escalated'],['resolved','Resolved'],['all','All requests']] as const;
export function supportViewWhere(view: string, actorId: string) {
  if (view === 'unassigned') return { assignedAdminId: null, status: { not: 'RESOLVED' } };
  if (view === 'mine') return { assignedAdminId: actorId, status: { not: 'RESOLVED' } };
  if (view === 'resolved') return { status: 'RESOLVED' };
  return {};
}

export function caseQueuePath(kind: string, input?: unknown) {
  const team = kind === 'SAFETY' ? 'safety' : kind === 'ESCALATION' ? 'customer-support' : '';
  const fallback = '/dashboard/cases' + (team ? `?team=${team}` : '');
  if (typeof input !== 'string' || input.length > 2000) return fallback;
  try { const url = new URL(input,'https://staff.invalid'); return url.origin === 'https://staff.invalid' && url.pathname === '/dashboard/cases' && (url.searchParams.get('team') ?? '') === team ? url.pathname + url.search : fallback; } catch { return fallback; }
}

export function supportQueuePath(input?: unknown) {
  if (typeof input !== 'string' || input.length > 2000) return '/dashboard/support';
  try { const url=new URL(input,'https://staff.invalid');return url.origin==='https://staff.invalid'&&url.pathname==='/dashboard/support'?url.pathname+url.search:'/dashboard/support'; } catch { return '/dashboard/support'; }
}
