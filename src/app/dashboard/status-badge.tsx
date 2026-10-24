import { humanize } from "@/lib/admin-ui";
import { BOOKING_STATUS_LABEL } from "@/lib/constants";

const COLOR: Record<string, string> = {
  PENDING: "badge-gray",
  MATCHED: "badge-blue",
  ACCEPTED: "badge-blue",
  PICKED_UP: "badge-blue",
  IN_TRANSIT: "badge-amber",
  DELIVERED: "badge-green",
  CANCELLED: "badge-red",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${COLOR[status] ?? "badge-gray"}`}>
      {BOOKING_STATUS_LABEL[status] ?? humanize(status)}
    </span>
  );
}
