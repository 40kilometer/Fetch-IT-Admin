import {PageHeader} from '@/components/admin-ui';
import {db} from '@/lib/db';
import {requireStaffPage} from '@/lib/staff-access';
import {ROLE_LABELS} from '@/lib/staff-policy';
import {ActionForm} from '@/components/action-form';
export default async function Page(){const staff=await requireStaffPage();const sessions=await db.staffSession.findMany({where:{userId:staff.id,revokedAt:null,expiresAt:{gt:new Date()}},orderBy:{createdAt:'desc'}});
  return <div><PageHeader eyebrow="Staff profile" title="My account" description="Review your profile and active sign-ins."/><section className="card conversation"><h2>{staff.name}</h2><p>{staff.email}</p><p>{ROLE_LABELS[staff.role]}</p><p>Contact an approved owner for changes to your role or account access. Use the sign-in page for password recovery.</p></section><h2 className="section-block">Active sessions</h2>{sessions.map(s=><section key={s.id}><p>Signed in {s.createdAt.toLocaleString("en-PH",{timeZone:"Asia/Manila"})} (PH) · Expires {s.expiresAt.toLocaleString("en-PH",{timeZone:"Asia/Manila"})} (PH)</p><ActionForm url="/api/sessions" hidden={{id:s.id}} label="Revoke this session" confirm/></section>)}</div>;
}
