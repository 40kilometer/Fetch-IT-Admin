"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BanButton({ userId, isBanned }: { userId: string; isBanned: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleBan() {
    const reason = prompt("Reason for restricting this account (shown to the user):");
    if (reason === null) return; // cancelled
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ban", reason }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      alert("Could not restrict this account.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnban() {
    if (!confirm("Lift the restriction on this account?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unban" }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      alert("Could not lift the restriction.");
    } finally {
      setLoading(false);
    }
  }

  return isBanned ? (
    <button className="btn" style={{ padding: "5px 12px", fontSize: 13 }} onClick={handleUnban} disabled={loading}>
      {loading ? "…" : "Unban"}
    </button>
  ) : (
    <button className="btn btn-danger" style={{ padding: "5px 12px", fontSize: 13 }} onClick={handleBan} disabled={loading}>
      {loading ? "…" : "Ban"}
    </button>
  );
}
