"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DEMO_ROLES } from "@/lib/staff-demo-roles";
import { ROLE_LABELS } from "@/lib/staff-policy";
import { AdminIcon } from "./admin-icon";

type Status = { unlocked: boolean; canStart: boolean; currentRole: string | null; expiresAt: string | null; controllerName: string | null };
async function statusRequest(signal?: AbortSignal): Promise<Status> {
  const response = await fetch("/api/auth/demo", { cache: "no-store", signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not check demo access. Please retry.");
  return data;
}
export function StaffDemoPicker() {
  const [status, setStatus] = useState<Status | null>(null), [busy, setBusy] = useState("");
  const [error, setError] = useState(""), [retry, setRetry] = useState(0);
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const pending = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    statusRequest(abort.signal).then(setStatus).catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not check demo access."); });
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
      if (!next.canStart && !next.unlocked) throw new Error("Use your Admin account to unlock role switching.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not unlock the demo."); }
    finally { pending.current = false; setBusy(""); setPassword(""); }
  }
  async function choose(role: string) {
    if (pending.current) return;
    pending.current = true; setBusy(role); setError("");
    try {
      const response = await fetch("/api/auth/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) setStatus({ unlocked: false, canStart: false, currentRole: null, expiresAt: null, controllerName: null });
        throw new Error(data.error || "Could not switch roles. Please retry.");
      }
      // Reload the entire portal so a previous role's cached navigation is gone.
      window.location.assign(data.redirect);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not switch roles."); pending.current = false; setBusy(""); }
  }
  const ready = !!status && (status.canStart || status.unlocked);
  return <div className="staff-demo-picker" aria-busy={!!busy}>
    <header className="demo-page-heading"><span className="eyebrow">Fetch-It Staff Portal</span><h1>For demo</h1><p>Choose a role to show how each team works.</p></header>
    {error && <p role="alert" className="error-message">{error}</p>}
    {!status && <section className="card demo-unlock"><p role="status">{error ? "Demo access could not be checked." : "Checking demo access…"}</p>{error && <button type="button" className="btn" onClick={() => { setError(""); setRetry(value => value + 1); }}>Retry</button>}</section>}
    {status && !ready && <form className="card demo-unlock" onSubmit={unlock}><h2>Unlock with your Admin account</h2><p>Sign in once, then switch between all five roles without entering their passwords.</p><label htmlFor="demo-admin-email">Admin email<input id="demo-admin-email" className="input" type="email" autoComplete="username" required maxLength={254} value={email} disabled={!!busy} onChange={event => setEmail(event.target.value)} /></label><label htmlFor="demo-admin-password">Admin password<input id="demo-admin-password" className="input" type="password" autoComplete="current-password" required maxLength={128} value={password} disabled={!!busy} onChange={event => setPassword(event.target.value)} /></label><button className="btn btn-primary" disabled={!!busy}>{busy === "unlock" ? "Signing in…" : "Unlock demo"}</button></form>}
    {ready && <div className="card demo-ready" role="status"><strong>Ready, {status.controllerName}.</strong><span>Select a role below. Demo access lasts up to one hour.</span></div>}
    <section className="demo-role-grid" aria-label="Demo roles">{DEMO_ROLES.map(option => <button className={`card demo-role-card ${status?.unlocked && status.currentRole === option.role ? "is-current" : ""}`} type="button" key={option.role} disabled={!ready || !!busy} onClick={() => void choose(option.role)}><AdminIcon name={option.icon} /><span><strong>{option.label}</strong><span>{option.description}</span></span><span className="demo-role-action">{busy === option.role ? "Opening…" : status?.unlocked && status.currentRole === option.role ? "Continue →" : "Open →"}</span></button>)}</section>
    <p className="muted small">Changes made during a demo are saved. Staff passwords are kept private.</p>
    <Link className="text-link" href={ready ? "/dashboard" : "/login"}>{ready ? "Back to the staff portal" : "Back to normal sign-in"}</Link>
  </div>;
}

export function StaffDemoBanner({ role, controllerName }: { role: string; controllerName: string }) {
  const pending = useRef(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function finish() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/demo", { method: "DELETE" }), data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not finish the demo.");
      window.location.assign(data.redirect);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please retry."); pending.current = false; setBusy(false); }
  }
  return <aside className="staff-demo-banner" aria-label="Demo mode"><div><strong>Demo: {DEMO_ROLES.find(option => option.role === role)?.label ?? ROLE_LABELS[role] ?? role}</strong><span>Presented by {controllerName}. Changes are saved.</span></div><div className="staff-actions">{!busy && <Link className="btn" href="/demo">Switch role</Link>}<button type="button" className="btn" disabled={busy} onClick={() => void finish()}>{busy ? "Finishing…" : "Finish demo"}</button></div>{error && <p className="error-message" role="alert">{error}</p>}</aside>;
}
