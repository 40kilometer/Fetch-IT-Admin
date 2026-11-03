// Recognize existing SOS records as well as the current safety-alert label.
export function isSafetyAlert(message: string, priority: string) {
  return priority === "URGENT" && (message.startsWith("URGENT SAFETY ALERT\n") || message.startsWith("SOS EMERGENCY ALERT\n"));
}

export function canCompleteSafetyAlert(role: string, record: { kind: string; status: string; emergencyAt?: Date | string | null }) {
  return role === "ADMIN" && record.kind === "SAFETY" && !!record.emergencyAt && record.status !== "RESOLVED";
}
