import { withRequestLog, RateLimitError, limitLogin, safeErrorCode } from "@/lib/request-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createAdminSessionToken, setAdminSessionCookie } from "@/lib/session";

async function handlePOST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || email.length > 254 || !password || password.length > 128) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    await limitLogin(req, "admin", String(email));
    const result = await db.$transaction(async tx => {
      const address = email.trim().toLowerCase();
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "email" = ${address} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { email: address }, include: { authIdentities: { where: { provider: "PASSWORD" } } } });
      if (!user || user.role !== "ADMIN" || user.isBanned || !user.authIdentities[0]?.passwordHash || !verifyPassword(password, user.authIdentities[0].passwordHash)) {
        await tx.adminAudit.create({ data: { actorId: user?.role === "ADMIN" ? user.id : null, actorName: user?.role === "ADMIN" ? user.name : "Unknown account", action: "LOGIN_FAILED", entityType: "AUTH", entityId: user?.role === "ADMIN" ? user.id : "unknown", details: { result: "Invalid credentials" } } });
        return null;
      }
      await tx.adminAudit.create({ data: { actorId: user.id, actorName: user.name, action: "LOGIN_SUCCEEDED", entityType: "AUTH", entityId: user.id, details: { result: "Signed in" } } });
      return { user, token: createAdminSessionToken({ uid: user.id, email: user.email, name: user.name }) };
    }, { maxWait: 10000, timeout: 20000 });
    if (!result) return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    const { user, token } = result;
    await setAdminSessionCookie(token);

    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
    console.error("[admin login] error", { code: safeErrorCode(err) });
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}

export const POST = withRequestLog("admin:auth/login:POST", handlePOST);
