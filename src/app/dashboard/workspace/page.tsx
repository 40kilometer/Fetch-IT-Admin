import Link from 'next/link';
import {db} from '@/lib/db';
import {requireStaffPage} from '@/lib/staff-access';
import {caseScope,hasPermission,ROLE_LABELS,supportScope} from '@/lib/staff-policy';
import {redirect} from 'next/navigation';
import {teamForRole,teamHome} from '@/lib/staff-teams';
export default async function Page(){
  const staff=await requireStaffPage();
  const ownTeam=teamForRole(staff.role);if(ownTeam)redirect(teamHome(ownTeam));
  const [openCases,waiting,mine,tickets]=await Promise.all([
    db.workflowCase.count({where:{AND:[caseScope(staff),{status:{not:'RESOLVED'}}]}}),
    db.workflowCase.count({where:{AND:[caseScope(staff),{status:'AWAITING_ADMIN'}]}}),
    db.workflowCase.count({where:{AND:[caseScope(staff),{assignedToId:staff.id,status:{not:'RESOLVED'}}]}}),
    hasPermission(staff.role,'support')?db.supportTicket.count({where:{AND:[supportScope(staff),{status:{not:'RESOLVED'}}]}}):Promise.resolve(null),
  ]);
  return <div><div className="page-heading"><div><div className="eyebrow">{ROLE_LABELS[staff.role]}</div><h1>Your workspace</h1><p>Welcome, {staff.name}. Your queues and actions follow your assigned role.</p></div></div>
    <div className="stat-grid">{[['Open reviews',openCases],['Awaiting approval',waiting],['Assigned to you',mine],...(tickets!==null?[['Accessible support tickets',tickets]]:[])].map(([label,value])=><Link className="card staff-stat" href={label==="Assigned to you"?"/dashboard/cases?view=mine":label==="Awaiting approval"?"/dashboard/cases?view=awaiting":label==="Accessible support tickets"?"/dashboard/support?status=active":"/dashboard/cases"} key={String(label)}><p>{label}</p><strong>{value}</strong><span className="muted small">Open queue →</span></Link>)}</div>
    <div className="staff-actions">{hasPermission(staff.role,'support')&&<Link className="btn" href="/dashboard/support">Open support inbox</Link>}{hasPermission(staff.role,'support.manage')&&<Link className="btn" href="/dashboard/team">Support team workload</Link>}{hasPermission(staff.role,'finance')&&<Link className="btn" href="/dashboard/finance">Payment records</Link>}<Link className="btn btn-primary" href="/dashboard/cases">Review queue</Link><Link className="btn" href="/dashboard/resources">Knowledge & announcements</Link></div>
    <section className="card conversation"><h2>How your team works</h2><p>Support handles communication. Support Supervisor coordinates the queue and escalated complaints. Finance reviews payment records. Safety Review investigates incidents and preserves case notes. Admin decides operational interventions.</p><p>Riders choose eligible jobs voluntarily. Exceptional assignment assistance still requires rider acceptance.</p></section></div>;
}
