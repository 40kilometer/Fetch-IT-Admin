import { reviewLabel, reviewStatus } from "@/lib/review-queue";
export function ReviewBadge({ value, status = false, detailed = false }: { value: string; status?: boolean; detailed?: boolean }) {
  const shown = status && !detailed ? reviewStatus(value) : value;
  const color = shown === "RESOLVED" ? "green" : ["URGENT", "HIGH"].includes(shown) ? "red" : shown === "OPEN" ? "amber" : "blue";
  return <span className={`badge badge-${color}`}>{reviewLabel(shown)}</span>;
}
