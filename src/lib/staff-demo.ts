// Legacy switched-session cleanup only. New access requires password sign-in.
import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import type { AdminSessionPayload } from "./session";
import { sessionSecret } from "./session-secret";
const DEMO_COOKIE = "fetchit_staff_demo";
const DEMO_MS = 60 * 60_000;
type Grant = { uid: string; sid: string; iat: number; exp: number };
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
export async function clearDemoCookie() { (await cookies()).delete(DEMO_COOKIE); }

export async function revokeDemoSessions(tx: Prisma.TransactionClient, session: AdminSessionPayload | null) {
  const grant = await readGrant(), parent = grant ?? session?.demo;
  if (!parent) return;
  await tx.staffSession.updateMany({ where: { id: parent.sid, userId: parent.uid }, data: { revokedAt: new Date() } });
  if (session?.demo && session.sid && session.sid !== parent.sid) await tx.staffSession.updateMany({ where: { id: session.sid, userId: session.uid }, data: { revokedAt: new Date() } });
}
