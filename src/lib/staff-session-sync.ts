// Only an invalidation signal is shared across tabs. No session credentials.
export const STAFF_SESSION_CHANGED = "fetchit:staff-session-changed";
export function announceStaffSessionChange() {
  try { localStorage.setItem(STAFF_SESSION_CHANGED, `${Date.now()}:${Math.random()}`); } catch { /* Focus checks also cover unavailable storage. */ }
}

export function watchStaffSession(identity: { id: string; role: string }, navigate: (url: string) => void, status?: (value:{expired:boolean;expiresAt?:string})=>void) {
  let stopped = false, pending = false, leaving = false;
  const abort = new AbortController();
  async function check() {
    if (stopped || pending || leaving || document.visibilityState === "hidden") return;
    pending = true;
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store", signal: abort.signal });
      if (stopped) return;
      if (response.status === 401) { if(status)status({expired:true});else{leaving = true; navigate("/login");} return; }
      if (!response.ok) return; // A temporary outage must not log out a valid user.
      const current = await response.json();
      if(!stopped)status?.({expired:false,expiresAt:current.expiresAt});
      if (!stopped && (current.id !== identity.id || current.role !== identity.role)) {
        leaving = true; navigate("/dashboard/workspace");
      }
    } catch { /* Retry on focus, navigation, or the next visible-tab check. */ }
    finally { pending = false; }
  }
  const storage = (event: StorageEvent) => { if (event.key === STAFF_SESSION_CHANGED) void check(); };
  window.addEventListener("focus", check);
  window.addEventListener("storage", storage);
  document.addEventListener("visibilitychange", check);
  const timer = window.setInterval(check, 30_000);
  void check();
  return () => {
    stopped = true; abort.abort(); window.clearInterval(timer);
    window.removeEventListener("focus", check); window.removeEventListener("storage", storage);
    document.removeEventListener("visibilitychange", check);
  };
}
