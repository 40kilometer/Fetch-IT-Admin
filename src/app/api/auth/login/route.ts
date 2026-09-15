import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createAdminSessionToken, setAdminSessionCookie } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { email: String(email).toLowerCase() } });

    // Same error for "no such user" and "wrong password" — don't leak
    // which one it was. Also reject outright if the account isn't an
    // admin, even with a correct password: this app is staff-only.
    if (!user || user.role !== "ADMIN" || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const token = createAdminSessionToken({ uid: user.id, email: user.email, name: user.name });
    await setAdminSessionCookie(token);

    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error("[admin login] error", err);
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
