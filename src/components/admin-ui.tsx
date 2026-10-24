import Link from "next/link";
import { humanize } from "@/lib/admin-ui";
export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: string; children?: React.ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p className="muted">{description}</p>}</div>{children}</div>;
}
export function Pager({ page, pages, total, noun, href, previousLabel = "Previous", nextLabel = "Next" }: { page: number; pages: number; total: number; noun: string; href: (page: number) => string; previousLabel?: string; nextLabel?: string }) {
  return <div className="pagination"><span className="muted">{total.toLocaleString("en-PH")} {noun} · Page {page} of {pages}</span><nav aria-label={`${noun} pages`}>{page > 1 ? <Link className="btn" href={href(page - 1)}>{previousLabel}</Link> : <span className="btn disabled-link" aria-disabled="true">{previousLabel}</span>}{page < pages ? <Link className="btn" href={href(page + 1)}>{nextLabel}</Link> : <span className="btn disabled-link" aria-disabled="true">{nextLabel}</span>}</nav></div>;
}
export function StateBadge({ value }: { value: string }) {
  const color = ["URGENT", "HIGH", "CANCELLED", "FAILED"].includes(value) ? "red" : ["RESOLVED", "APPROVED", "PAID", "DELIVERED"].includes(value) ? "green" : ["AWAITING_ADMIN", "OPEN", "PENDING", "UNPAID"].includes(value) ? "amber" : "blue";
  return <span className={`badge badge-${color}`}>{humanize(value)}</span>;
}
