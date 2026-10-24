import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/staff-access";
import { AdminShell } from "./admin-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const admin = await currentStaff();
  if (!admin) redirect("/login");
  return <AdminShell admin={admin}>{children}</AdminShell>;
}
