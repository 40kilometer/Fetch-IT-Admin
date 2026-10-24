import { AccountDirectory } from "@/components/account-directory";
import type { SearchParams } from "@/lib/admin-ui";
export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <AccountDirectory role="CUSTOMER" query={await searchParams} />;
}
