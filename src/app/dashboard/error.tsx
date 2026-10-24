"use client";
import Link from "next/link";
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <section className="card conversation" role="alert"><h1>Couldn’t load this page</h1><p>The records are temporarily unavailable. Retry, or return to your workspace.</p><div className="row-actions"><button className="btn btn-primary" onClick={() => retry()}>Try again</button><Link className="btn" href="/dashboard/workspace">My workspace</Link></div></section>;
}
