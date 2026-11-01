// Recognize existing SOS records as well as the current safety-alert label.
export function isSafetyAlert(message: string, priority: string) {
  return priority === "URGENT" && (message.startsWith("URGENT SAFETY ALERT\n") || message.startsWith("SOS EMERGENCY ALERT\n"));
}
