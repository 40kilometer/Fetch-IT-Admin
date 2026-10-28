import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { sessionSecret } from "./session-secret";
import { assertRuntimeAccess } from "./runtime-access";
import { createAdminSessionToken, getAdminSession, setAdminSessionCookie, verifyAdminSessionToken, type AdminSessionPayload } from "./session";
import { isStaffRole, type StaffRole } from "./staff-policy";
import { teamForRole, teamHome } from "./staff-teams";

const DEMO_COOKIE = "fetchit_staff_demo";
const DEMO_MS = 60 * 60_000;
const STAFF_EMAILS: Record<Exclude<StaffRole, "ADMIN">, string> = {
  SUPPORT: "cs@staff.fetchit.invalid", SUPPORT_SUPERVISOR: "cs-supervisor@staff.fetchit.invalid",
  FINANCE: "finance@staff.fetchit.invalid", SAFETY: "safety@staff.fetchit.invalid",
};
type Grant = { uid: string; sid: string; iat: number; exp: number };
type SessionUser = { id: string; name: string; email: string; role: string; isBanned: boolean; authInvalidBefore: Date | null };
type LiveSession = { userId: string; revokedAt: Date | null; expiresAt: Date } | null;
export class DemoAccessError extends Error {
  constructor(message: string, public status = 403) { super(message); }
}
function active(session: { uid: string; iat?: number }, user: SessionUser | null, live: LiveSession) {
  return !!user && !user.isBanned && !!live && live.userId === user.id && user.id === session.uid && !live.revokedAt && live.expiresAt > new Date()
    && (!user.authInvalidBefore || (session.iat !== undefined && session.iat > user.authInvalidBefore.getTime()));
}
function signature(value: string) {
  return crypto.createHmac("sha256", sessionSecret("ADMIN_SESSION_SECRET")).update("staff-demo:" + value).digest("base64url");
}
async function readGrant(): Promise<Grant | null> {
  const value = (await cookies()).get(DEMO_COOKIE)?.value;
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = Buffer.from(signature(parts[0])), received = Buffer.from(parts[1]);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  try {
    const grant = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return typeof grant.uid === "string" && grant.uid && typeof grant.sid === "string" && grant.sid && Number.isFinite(grant.iat) && grant.iat <= Date.now() && Number.isFinite(grant.exp) && grant.exp > Date.now() && grant.exp <= Date.now() + DEMO_MS ? grant : null;
  } catch { return null; }
}
async function setGrant(grant: Grant) {
  const value = Buffer.from(JSON.stringify(grant)).toString("base64url");
  (await cookies()).set(DEMO_COOKIE, value + "." + signature(value), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: Math.max(0, Math.floor((grant.exp - Date.now()) / 1000)) });
}
export async function clearDemoCookie() { (await cookies()).delete(DEMO_COOKIE); }

export async function getDemoController() {
  const grant = await readGrant();
  if (!grant) return null;
  await assertRuntimeAccess("staff");
  const [user, live] = await Promise.all([
    db.user.findUnique({ where: { id: grant.uid }, select: { id: true, name: true, email: true, role: true, isBanned: true, authInvalidBefore: true } }),
    db.staffSession.findUnique({ where: { id: grant.sid } }),
  ]);
  return user?.role === "ADMIN" && active(grant, user, live) ? { grant, user } : null;
}
async function startingAdmin() {
  const session = await getAdminSession();
  if (!session?.sid || session.demo || session.iat === undefined) return null;
  await assertRuntimeAccess("staff");
  const [user, live] = await Promise.all([
    db.user.findUnique({ where: { id: session.uid }, select: { id: true, name: true, email: true, role: true, isBanned: true, authInvalidBefore: true } }),
    db.staffSession.findUnique({ where: { id: session.sid } }),
  ]);
  return user?.role === "ADMIN" && active(session, user, live) ? { user, grant: { uid: user.id, sid: session.sid, iat: session.iat, exp: Math.min(session.exp, live!.expiresAt.getTime(), Date.now() + DEMO_MS) } } : null;
}
export async function demoStatus() {
  const controller = await getDemoController(), starter = controller ? null : await startingAdmin();
  const session = await getAdminSession();
  const current = session?.demo && controller && session.demo.uid === controller.grant.uid && session.demo.sid === controller.grant.sid
    ? await db.user.findUnique({ where: { id: session.uid }, select: { role: true } }) : null;
  return { unlocked: !!controller, canStart: !!starter, currentRole: current?.role ?? (starter ? "ADMIN" : null), expiresAt: controller ? new Date(controller.grant.exp).toISOString() : null, controllerName: (controller ?? starter)?.user.name ?? null };
}
export async function revokeDemoSessions(tx: Prisma.TransactionClient, session: AdminSessionPayload | null) {
  const grant = await readGrant(), parent = grant ?? session?.demo;
  if (!parent) return;
  await tx.staffSession.updateMany({ where: { id: parent.sid, userId: parent.uid }, data: { revokedAt: new Date() } });
  if (session?.demo && session.sid && session.sid !== parent.sid) await tx.staffSession.updateMany({ where: { id: session.sid, userId: session.uid }, data: { revokedAt: new Date() } });
}
export async function switchDemoRole(role: unknown) {
  if (!isStaffRole(role)) throw new DemoAccessError("Choose a demo role.", 400);
  const controller = await getDemoController() ?? await startingAdmin();
  if (!controller) throw new DemoAccessError("Sign in as Admin once to unlock the demo.", 401);
  const previous = await getAdminSession(), { grant } = controller;
  const result = await db.$transaction(async tx => {
    if (role !== "ADMIN") await tx.$queryRaw`SELECT "id" FROM "User" WHERE "email" = ${STAFF_EMAILS[role]} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${grant.uid} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "StaffSession" WHERE "id" = ${grant.sid} FOR UPDATE`;
    const [admin, parent] = await Promise.all([tx.user.findUnique({ where: { id: grant.uid } }), tx.staffSession.findUnique({ where: { id: grant.sid } })]);
    if (admin?.role !== "ADMIN" || !active(grant, admin, parent) || grant.exp <= Date.now()) throw new DemoAccessError("Demo access expired. Sign in as Admin again.", 401);
    const target = role === "ADMIN" ? admin : await tx.user.findUnique({ where: { email: STAFF_EMAILS[role] } });
    if (!target || target.isBanned || target.role !== role) throw new DemoAccessError("This demonstration account is unavailable.", 409);
    const token = createAdminSessionToken({ uid: target.id, email: target.email, name: target.name, demo: { uid: grant.uid, sid: grant.sid } }, grant.exp);
    const child = verifyAdminSessionToken(token)!;
    await tx.staffSession.create({ data: { id: child.sid!, userId: target.id, expiresAt: new Date(child.exp) } });
    if (previous?.demo?.uid === grant.uid && previous.demo.sid === grant.sid && previous.sid !== grant.sid) await tx.staffSession.updateMany({ where: { id: previous.sid, userId: previous.uid }, data: { revokedAt: new Date() } });
    await tx.adminAudit.create({ data: { actorId: admin.id, actorName: admin.name, action: "DEMO_ROLE_SWITCHED", entityType: "AUTH", entityId: target.id, details: { role, account: target.email, demoSessionId: child.sid!, controllerSessionId: grant.sid } } });
    return { token, role: target.role };
  }, { maxWait: 10000, timeout: 20000 });
  await setGrant(grant);
  await setAdminSessionCookie(result.token);
  const team = teamForRole(result.role);
  return { redirect: team ? teamHome(team) : "/dashboard" };
}
export async function finishDemo() {
  const controller = await getDemoController();
  if (!controller) throw new DemoAccessError("Demo access expired. Sign in as Admin again.", 401);
  const previous = await getAdminSession(), { grant } = controller;
  const token = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${grant.uid} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "StaffSession" WHERE "id" = ${grant.sid} FOR UPDATE`;
    const [admin, parent] = await Promise.all([tx.user.findUnique({ where: { id: grant.uid } }), tx.staffSession.findUnique({ where: { id: grant.sid } })]);
    if (admin?.role !== "ADMIN" || !active(grant, admin, parent) || grant.exp <= Date.now()) throw new DemoAccessError("Demo access expired. Sign in as Admin again.", 401);
    const restored = createAdminSessionToken({ uid: admin.id, email: admin.email, name: admin.name }, parent!.expiresAt.getTime());
    const payload = verifyAdminSessionToken(restored)!;
    await tx.staffSession.create({ data: { id: payload.sid!, userId: admin.id, expiresAt: new Date(payload.exp) } });
    await revokeDemoSessions(tx, previous);
    await tx.adminAudit.create({ data: { actorId: admin.id, actorName: admin.name, action: "DEMO_FINISHED", entityType: "AUTH", entityId: admin.id, details: { controllerSessionId: grant.sid } } });
    return restored;
  }, { maxWait: 10000, timeout: 20000 });
  await clearDemoCookie(); await setAdminSessionCookie(token);
  return { redirect: "/dashboard" };
}
