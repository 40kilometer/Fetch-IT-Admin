import { db } from "./db";
import { getAdminSession } from "./session";
import { redirect } from "next/navigation";
export async function currentAdmin() {
  const session = await getAdminSession();
  if (!session) return null;
  const user = await db.user.findUnique({ where: { id: session.uid }, select: { id: true, name: true, email: true, role: true, isBanned: true } });
  return user?.role === "ADMIN" && !user.isBanned ? user : null;
}
export async function requireAdminPage() {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");
  return admin;
}
