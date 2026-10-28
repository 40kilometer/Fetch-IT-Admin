"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DEMO_ROLES, DEMO_STAFF_EMAILS } from "@/lib/staff-demo-roles";
import { AdminIcon } from "./admin-icon";

type Status = { unlocked: boolean; canStart: boolean; currentRole: string | null; expiresAt: string | null; controllerName: string | null; canUseAdmin: boolean; currentEmail: string | null };
async function statusRequest(signal?: AbortSignal): Promise<Status> {
  const response = await fetch("/api/auth/demo", { cache: "no-store", signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not check staff access. Please retry.");
  return data;
}
export function StaffAccountPicker() {
  const [status, setStatus] = useState<Status | null>(null), [busy, setBusy] = useState("");
  const [error, setError] = useState(""), [retry, setRetry] = useState(0);
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const pending = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    statusRequest(abort.signal).then(setStatus).catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not check staff access."); });
    return () => abort.abort();
  }, [retry]);
  async function unlock(event: React.FormEvent) {
    event.preventDefault(); if (pending.current) return;
    pending.current = true; setBusy("unlock"); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not sign in. Please retry.");
      const next = await statusRequest(); setStatus(next);
      if (!next.canStart && !next.unlocked) throw new Error("Use a staff switching account or Admin to continue.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open staff accounts."); }
    finally { pending.current = false; setBusy(""); setPassword(""); }
  }
  async function choose(role: string) {
    if (pending.current) return;
    pending.current = true; setBusy(role); setError("");
    try {
      const response = await fetch("/api/auth/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) setStatus({ unlocked: false, canStart: false, currentRole: null, expiresAt: null, controllerName: null, canUseAdmin: false, currentEmail: null });
        throw new Error(data.error || "Could not switch roles. Please retry.");
      }
      // Reload the entire portal so a previous role's cached navigation is gone.
      window.location.assign(data.redirect);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not switch roles."); pending.current = false; setBusy(""); }
  }
  const ready = !!status && (status.canStart || status.unlocked);
  return <div className="staff-demo-picker" aria-busy={!!busy}>
    <header className="demo-page-heading"><span className="eyebrow">Fetch-It Staff Portal</span><h1>Switch staff</h1><p>Choose the account you want to work with.</p></header>
    {error && <p role="alert" className="error-message">{error}</p>}
    {!status && <section className="card demo-unlock"><p role="status">{error ? "Staff access could not be checked." : "Checking staff access…"}</p>{error && <button type="button" className="btn" onClick={() => { setError(""); setRetry(value => value + 1); }}>Retry</button>}</section>}
    {status && !ready && <form className="card demo-unlock" onSubmit={unlock}><h2>Sign in once to switch staff</h2><p>Use your staff account to continue. Admin sign-in is required to open the Admin account.</p><label htmlFor="demo-admin-email">Staff email<input id="demo-admin-email" className="input" type="email" autoComplete="username" required maxLength={254} value={email} disabled={!!busy} onChange={event => setEmail(event.target.value)} /></label><label htmlFor="demo-admin-password">Password<input id="demo-admin-password" className="input" type="password" autoComplete="current-password" required maxLength={128} value={password} disabled={!!busy} onChange={event => setPassword(event.target.value)} /></label><button className="btn btn-primary" disabled={!!busy}>{busy === "unlock" ? "Signing in…" : "Continue"}</button></form>}
    {ready && <div className="card demo-ready" role="status"><strong>Signed in as {status.currentEmail}.</strong><span>Choose a staff account below.</span></div>}
    <section className="demo-role-grid" aria-label="Staff accounts">{DEMO_ROLES.map(option => <button className={`card demo-role-card ${status?.unlocked && status.currentRole === option.role ? "is-current" : ""}`} type="button" key={option.role} disabled={!status || !!busy || (ready && option.role === "ADMIN" && !status?.canUseAdmin)} onClick={() => { if (!ready) { setEmail(option.role === "ADMIN" ? "" : DEMO_STAFF_EMAILS[option.role]); document.getElementById("demo-admin-password")?.focus(); } else void choose(option.role); }}><AdminIcon name={option.icon} /><span><strong>{option.label}</strong>{option.role !== "ADMIN" && <span>{DEMO_STAFF_EMAILS[option.role]}</span>}<span>{option.description}</span></span><span className="demo-role-action">{busy === option.role ? "Opening…" : status?.unlocked && status.currentRole === option.role ? "Continue →" : ready && option.role === "ADMIN" && !status?.canUseAdmin ? "Admin sign-in required" : !ready ? "Use this account →" : "Open →"}</span></button>)}</section>
    {ready && !status.canUseAdmin && <Link className="text-link" href="/login">Sign in as Admin to open the Admin role</Link>}
    <p className="muted small">Actions are saved to live records under the selected account. Switching access lasts up to one hour.</p>
    <Link className="text-link" href={ready ? "/dashboard" : "/login"}>{ready ? "Back to the staff portal" : "Back to normal sign-in"}</Link>
  </div>;
}

export function StaffSessionReturn() {
  const pending = useRef(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function finish() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/demo", { method: "DELETE" }), data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not return to your original account.");
      window.location.assign(data.redirect);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please retry."); pending.current = false; setBusy(false); }
  }
  return <div className="staff-session-return"><button type="button" className="btn" disabled={busy} onClick={() => void finish()}>{busy ? "Returning…" : "Return to original account"}</button>{error && <p className="error-message" role="alert">{error}</p>}</div>;
}
