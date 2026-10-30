"use client";
import { useEffect, useRef, useState } from "react";
import { announceStaffSessionChange } from "@/lib/staff-session-sync";
import { staffReturnPath } from "@/lib/staff-return-path";
import { PASSWORD_REQUIREMENT } from "@/lib/staff-password-policy";
import { useLocalDemo } from '@/hooks/use-local-demo';
export default function LoginPage() {
  const lab = useLocalDemo();
  const [demoActor, setDemoActor] = useState('reviewer');
  const pending = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [mode, setMode] = useState<"login" | "send" | "reset">("login");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("logout") === "cleanup-pending") setNotice("Signed out on this browser. Server session cleanup could not be confirmed. If you use a shared device, close other Fetch-It tabs.");
  }, []);
  async function demoLogin() {
    if (pending.current) return;
    pending.current = true; setLoading(true); setError('');
    try {
      const response = await fetch('/api/local-demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actor: demoActor }) });
      const data = await response.json(); if (!response.ok) throw Error(data.error || 'Demo sign-in failed.');
      announceStaffSessionChange(); window.location.assign('/dashboard/applications');
    } catch (e) { setError(e instanceof Error ? e.message : 'Demo sign-in failed.'); } finally { pending.current = false; setLoading(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (pending.current) return;
    pending.current = true; setLoading(true); setError(""); setNotice("");
    try {
      const route = mode === "login" ? "login" : mode === "send" ? "send-reset" : "reset-password";
      const response = await fetch("/api/auth/" + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, challengeId, code }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed. Please retry.");
      if (mode === "login") { announceStaffSessionChange(); window.location.assign(staffReturnPath(new URLSearchParams(window.location.search).get("next"))); }
      else if (mode === "send") { setChallengeId(data.challengeId); setMode("reset"); setPassword(""); setCode(""); setNotice(data.message); }
      else { setMode("login"); setPassword(""); setCode(""); setChallengeId(""); setNotice(data.message); }
    } catch (error) { setError(error instanceof Error ? error.message : "Service unavailable. Please retry."); }
    finally { pending.current = false; setLoading(false); }
  }
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
    <form onSubmit={submit} className="card" style={{ width: "100%", maxWidth: 400, padding: 32 }} aria-busy={loading}>
      <h1 style={{ fontSize: 22 }}>Fetch Staff Portal</h1>
      {lab.enabled && <aside className="card" style={{ padding: 16, margin: '18px 0', borderColor: '#bf702f' }}><strong>LOCAL DEMO LAB</strong><p className="small">Connected to the isolated Rider test database. No production accounts or real emails.</p><label>Demo staff account<select value={demoActor} onChange={e => setDemoActor(e.target.value)}><option value="reviewer">Review Admin</option><option value="approver">Orientation Admin</option><option value="activator">Activation Admin</option><option value="safety">Safety Reviewer</option></select></label><button className="btn primary" type="button" disabled={loading} onClick={() => void demoLogin()}>Use demo staff</button></aside>}
      <p className="muted small">{mode === "login" ? "Staff sign-in only." : mode === "send" ? "Recover your staff password." : "Enter the 6-digit code sent to your email. It expires in 10 minutes."}</p>
      <label htmlFor="email">Email</label><input id="email" className="input" type="email" autoComplete="username" required value={email} disabled={loading || mode === "reset"} onChange={event => setEmail(event.target.value)} style={{ marginBottom: 16 }} />
      {mode === "reset" && <><label htmlFor="code">Email code</label><input id="code" className="input" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={code} disabled={loading} onChange={event => setCode(event.target.value)} style={{ marginBottom: 16 }} /></>}
      {mode !== "send" && <><label htmlFor="password">{mode === "reset" ? "New password" : "Password"}</label><div style={{ display: "flex", gap: 8, marginBottom: 16 }}><input id="password" className="input" type={show ? "text" : "password"} autoComplete={mode === "reset" ? "new-password" : "current-password"} required value={password} disabled={loading} onChange={event => setPassword(event.target.value)} /><button type="button" className="btn" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} disabled={loading} onClick={() => setShow(value => !value)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{show && <path d="m3 3 18 18" />}</svg></button></div>{mode === "reset" && <p className="muted small">{PASSWORD_REQUIREMENT}</p>}</>}
      {error && <p role="alert" className="error-message">{error}</p>}{notice && <p role="status" className="small">{notice}</p>}
      <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: "100%", justifyContent: "center" }}>{loading && <span className="login-spinner" aria-hidden="true" />}{loading ? "Please wait…" : mode === "login" ? "Sign in" : mode === "send" ? "Send recovery code" : "Update password"}</button>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}><button type="button" className="btn" disabled={loading} onClick={() => { setMode(mode === "login" ? "send" : "login"); setPassword(""); setShow(false); setError(""); setNotice(""); }}>{mode === "login" ? "Forgot password?" : "Back to sign in"}</button>{mode === "reset" && <button type="button" className="btn" disabled={loading} onClick={() => { setMode("send"); setCode(""); setError(""); }}>Request new code</button>}</div>
    </form>
  </main>;
}
