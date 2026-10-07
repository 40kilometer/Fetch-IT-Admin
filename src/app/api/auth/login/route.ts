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
    const user = await db.user.findUnique({ where: { email: String(email).trim().toLowerCase() }, include: { authIdentities: { where: { provider: "PASSWORD" } } } });

    // Same error for "no such user" and "wrong password" — don't leak
    // which one it was. Also reject outright if the account isn't an
    // admin, even with a correct password: this app is staff-only.
    if (!user || user.role !== "ADMIN" || user.isBanned || !user.authIdentities[0]?.passwordHash || !verifyPassword(password, user.authIdentities[0].passwordHash)) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const token = createAdminSessionToken({ uid: user.id, email: user.email, name: user.name });
    await setAdminSessionCookie(token);

    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
    console.error("[admin login] error", { code: safeErrorCode(err) });
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}

export const POST = withRequestLog("admin:auth/login:POST", handlePOST);
