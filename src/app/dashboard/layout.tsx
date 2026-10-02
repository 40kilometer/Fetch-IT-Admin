import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/admin-access";
import { AdminShell } from "./admin-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");
  return <AdminShell admin={admin}>{children}</AdminShell>;
}
