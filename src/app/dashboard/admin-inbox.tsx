'use client';
import Link from 'next/link';
import {NotificationInbox} from '@/components/notification-inbox';
import {ClaimEntry} from '@/components/claim-entry';
export function AdminInbox({adminId,role}:{adminId:string;role:string}){
 return <NotificationInbox key={adminId} actorId={adminId} role={role} renderLink={(item,children,onNavigate)=>item.claim?<ClaimEntry href={item.href} endpoint={item.claim.endpoint} revision={item.claim.revision} kind={item.claim.kind} recordLabel={item.title} onNavigate={onNavigate} claimable className="inbox-item">{children}</ClaimEntry>:<Link href={item.href} onClick={onNavigate} className="inbox-item">{children}</Link>}/>;
}
