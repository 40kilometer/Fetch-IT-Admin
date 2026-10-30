"use client";

import { useRef, useState } from "react";
import { announceStaffSessionChange } from "@/lib/staff-session-sync";
import { allowStaffAccountReload } from "@/components/staff-drafts";

export function LogoutButton() {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function logout() {
    if (pending.current || !window.confirm("Log out of Fetch-It? Unsubmitted text drafts stay on this browser for this account.")) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok && result.signedOut !== true) throw new Error(result.error || "Couldn’t log out. Please try again.");
      announceStaffSessionChange();
      allowStaffAccountReload();
      window.location.assign(response.ok ? "/login" : "/login?logout=cleanup-pending");
    } catch {
      setError("Couldn’t confirm logout. Check your connection and try again.");
    } finally { pending.current = false; setBusy(false); }
  }
  return <>
    <button type="button"
      className="btn"
      style={{ width: "100%", justifyContent: "center" }}
      disabled={busy} aria-busy={busy}
      onClick={() => void logout()}
    >
      {busy ? "Logging out…" : "Log out"}
    </button>
    {busy && <p className="small" role="status">Ending your staff session…</p>}
    {error && <p className="error-message small" role="alert">{error}</p>}
  </>;
}
