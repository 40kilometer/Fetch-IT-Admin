import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { action, reason } = await req.json();

  const target = await db.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (target.role === "ADMIN") {
    return NextResponse.json({ error: "Admin accounts can't be banned from here." }, { status: 403 });
  }

  if (action === "ban") {
    const user = await db.user.update({
      where: { id },
      data: { isBanned: true, banReason: reason || null, bannedAt: new Date() },
    });
    return NextResponse.json({ user });
  }

  if (action === "unban") {
    const user = await db.user.update({
      where: { id },
      data: { isBanned: false, banReason: null, bannedAt: null },
    });
    return NextResponse.json({ user });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
