import { db } from "./db";
import { getAdminSession } from "./session";
import { hasPermission, isStaffRole, type Permission } from "./staff-policy";
import { redirect } from "next/navigation";
import {assertRuntimeAccess} from './runtime-access';
import {getDemoController} from './staff-demo';
export async function currentStaff(permission?: Permission) {
  const session = await getAdminSession();
  if (!session?.sid) return null;
  await assertRuntimeAccess('staff');
  const [user, live] = await Promise.all([
    db.user.findUnique({ where:{id:session.uid}, select:{id:true,name:true,email:true,role:true,isBanned:true,authInvalidBefore:true} }),
    db.staffSession.findUnique({where:{id:session.sid}}),
  ]);
  if (!user || !isStaffRole(user.role) || user.isBanned || !live || live.userId!==user.id || live.revokedAt || live.expiresAt <= new Date() || (user.authInvalidBefore && (!session.iat || session.iat<=user.authInvalidBefore.getTime()))) return null;
  if (permission && !hasPermission(user.role,permission)) return null;
  if (session.demo) {
    const controller=await getDemoController();
    if(!controller||controller.grant.uid!==session.demo.uid||controller.grant.sid!==session.demo.sid)return null;
    return {...user,sessionExpiresAt:new Date(Math.min(session.exp,live.expiresAt.getTime())).toISOString(),demo:{controllerName:controller.user.name,expiresAt:new Date(controller.grant.exp).toISOString()}};
  }
  return {...user,sessionExpiresAt:new Date(Math.min(session.exp,live.expiresAt.getTime())).toISOString(),demo:null};
}
export async function requireStaffPage(permission?: Permission) {
  const staff=await currentStaff(); if(!staff) redirect('/login');
  if(permission && !hasPermission(staff.role,permission)) redirect('/dashboard/workspace');
  return staff;
}
