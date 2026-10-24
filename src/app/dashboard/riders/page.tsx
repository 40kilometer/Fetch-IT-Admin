import { AccountDirectory } from "@/components/account-directory";
import type { SearchParams } from "@/lib/admin-ui";
export default async function RidersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <AccountDirectory role="RIDER" query={await searchParams} />;
}
