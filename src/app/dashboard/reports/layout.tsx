import { requireAdminPage } from "@/lib/admin-access";
export default async function Layout({children}:{children:React.ReactNode}) { await requireAdminPage(); return children; }
