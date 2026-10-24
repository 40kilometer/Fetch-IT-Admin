import { requireStaffPage } from "@/lib/staff-access";
import { RiderApplications } from "@/components/rider-applications";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { await requireStaffPage("safety"); const { id } = await params; return <RiderApplications id={id}/>; }
