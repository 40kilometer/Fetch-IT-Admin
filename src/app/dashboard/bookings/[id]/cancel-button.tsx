"use client";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
export function CancelButton({ bookingId, disabled, reference = bookingId }: { bookingId: string; disabled: boolean; reference?: string }) {
  const router = useRouter();
  return <ConfirmDialog draftId={`booking:${bookingId}:cancellation`} trigger="Cancel booking" title={`Cancel booking ${reference}?`} description="This ends the booking and cannot be undone. Review the booking’s payment record for any refund follow-up. Your reason is recorded in the audit log." confirmLabel="Cancel booking" reasonLabel="Cancellation reason" danger disabled={disabled} onConfirm={async reason => {
    const response = await fetch(`/api/bookings/${bookingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", reason }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not cancel this booking."); router.refresh();
  }} />;
}
