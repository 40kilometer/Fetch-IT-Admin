import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "./db";
import { consumeEmailCode, issueEmailCode, EMAIL_CODE_TTL_MS } from "./auth-email-code";
import { requireEmailCodeSender, sendAuthEmailCode } from "./auth-email-sender";
import { clientAddress, limitRequests } from "./request-guard";
import { validNewPassword, PASSWORD_REQUIREMENT } from "./password-policy";
import { hashPassword } from "./password";

export async function adminPasswordReset(req: NextRequest, action: "send" | "reset") {
  const origin = req.headers.get("origin");
  if ((origin && origin !== req.nextUrl.origin) || req.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "This request is not allowed." }, { status: 403 });
  try { requireEmailCodeSender(); } catch { return NextResponse.json({ error: "Password recovery is unavailable. Contact the administrator." }, { status: 503 }); }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  await limitRequests(`admin:reset-${action}-ip`, clientAddress(req), action === "send" ? 30 : 120, 60 * 60_000);
  if (action === "send") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    await limitRequests("admin:reset-cooldown", email, 1, 60_000);
    await limitRequests("admin:reset-account", email, 6, 60 * 60_000);
    await limitRequests("email-code:daily-sends", "gmail", 200, 24 * 60 * 60_000);
    const user = await db.user.findUnique({ where: { email }, include: { authIdentities: true } });
    let challenge = { id: randomUUID(), expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS) };
    if (user?.role === "ADMIN" && !user.isBanned && user.authIdentities.some(identity => identity.provider === "PASSWORD" && identity.passwordHash)) {
      const issued = await issueEmailCode("ADMIN_RESET_PASSWORD", { email, subjectId: user.id, provider: "PASSWORD" });
      challenge = issued;
      try { await sendAuthEmailCode(email, "ADMIN_RESET_PASSWORD", issued.code); }
      catch {
        await db.authEmailCode.deleteMany({ where: { id: issued.id } });
        console.info(JSON.stringify({ operation: "admin:password-reset/delivery", code: "EMAIL_DELIVERY_FAILED" }));
      }
    }
    return NextResponse.json({ challengeId: challenge.id, expiresAt: challenge.expiresAt.toISOString(), message: "If this is an active admin account, a code has been sent. Check your inbox and spam folder." });
  }
  if (!validNewPassword(body.password)) return NextResponse.json({ error: PASSWORD_REQUIREMENT }, { status: 400 });
  const invalid = () => NextResponse.json({ error: "The code is incorrect, expired or already used. Request a new code." }, { status: 400 });
  if (typeof body.challengeId !== "string" || typeof body.code !== "string") return invalid();
  const challenge = await consumeEmailCode(body.challengeId, "ADMIN_RESET_PASSWORD", body.code);
  if (!challenge || challenge.provider !== "PASSWORD") return invalid();
  const changed = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${challenge.subjectId} FOR UPDATE`;
    const result = await tx.authIdentity.updateMany({ where: { userId: challenge.subjectId, provider: "PASSWORD", user: { email: challenge.email, role: "ADMIN", isBanned: false } }, data: { passwordHash: hashPassword(body.password) } });
    if (result.count === 1) {
      const user = await tx.user.update({ where: { id: challenge.subjectId }, data: { authInvalidBefore: new Date() } });
      await tx.adminAudit.create({ data: { actorId: user.id, actorName: user.name, action: "PASSWORD_RESET", entityType: "USER", entityId: user.id, details: { method: "Email code" } } });
    }
    return result.count;
  }, { maxWait: 10000, timeout: 20000 });
  return changed === 1 ? NextResponse.json({ message: "Password updated. Sign in with your new password." }) : invalid();
}
