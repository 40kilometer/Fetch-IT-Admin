"use client";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
export function BanButton({ userId, isBanned, name = "this account" }: { userId: string; isBanned: boolean; name?: string }) {
  const router = useRouter();
  return <ConfirmDialog draftId={`account:${userId}:restriction`} trigger={isBanned ? "Lift restriction" : "Restrict account"} title={`${isBanned ? "Lift restriction for" : "Restrict"} ${name}?`} description={isBanned ? "This restores access to the account. The change is recorded in the audit log." : "The user will lose access while restricted. The reason is shown to them and recorded in the audit log."} confirmLabel={isBanned ? "Lift restriction" : "Restrict account"} reasonLabel={isBanned ? undefined : "Reason shown to the user"} danger={!isBanned} onConfirm={async reason => {
    const response = await fetch(`/api/users/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: isBanned ? "unban" : "ban", reason }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not update the account."); router.refresh();
  }} />;
}
