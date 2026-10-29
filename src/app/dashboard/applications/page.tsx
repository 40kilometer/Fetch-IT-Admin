import { requireStaffPage } from "@/lib/staff-access";
import { RiderApplications } from "@/components/rider-applications";
export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireStaffPage("safety");
  const { status } = await searchParams;
  return <RiderApplications key={typeof status === "string" ? status : ""} initialStatus={typeof status === "string" ? status : ""}/>;
}
