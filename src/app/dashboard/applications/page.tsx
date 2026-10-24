import { requireStaffPage } from "@/lib/staff-access";
import { RiderApplications } from "@/components/rider-applications";
export default async function Page() { await requireStaffPage("safety"); return <RiderApplications/>; }
