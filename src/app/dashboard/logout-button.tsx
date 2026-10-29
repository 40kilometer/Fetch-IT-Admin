"use client";

import { announceStaffSessionChange } from "@/lib/staff-session-sync";

export function LogoutButton() {
  return (
    <button type="button"
      className="btn"
      style={{ width: "100%", justifyContent: "center" }}
      onClick={async () => {
        if (!window.confirm("Are you sure you want to log out of Fetch-It?")) return;
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
