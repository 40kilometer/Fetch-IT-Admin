"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CancelButton({ bookingId, disabled }: { bookingId: string; disabled: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleCancel() {
    const reason = prompt("Why is this booking being cancelled? (Recorded in the audit log)");
    if (reason === null) return;
    if (!reason.trim() || reason.length > 500) { alert("Add a reason of up to 500 characters."); return; }
    if (!confirm("Force-cancel this booking? This cannot be undone.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", reason }),
      });
      if (!res.ok) throw new Error("Failed to cancel.");
      router.refresh();
    } catch {
      alert("Could not cancel this booking.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button className="btn btn-danger" onClick={handleCancel} disabled={disabled || loading}>
      {loading ? "Cancelling…" : "Force-cancel booking"}
    </button>
  );
}
