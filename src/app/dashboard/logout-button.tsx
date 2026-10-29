"use client";

import { announceStaffSessionChange } from "@/lib/staff-session-sync";

export function LogoutButton() {
  return (
    <button
      className="btn"
      style={{ width: "100%", justifyContent: "center" }}
      onClick={async () => {
        const response = await fetch("/api/auth/logout", { method: "POST" });
        if (!response.ok) return;
        announceStaffSessionChange();
        window.location.assign("/login");
      }}
    >
      Log out
    </button>
  );
}
