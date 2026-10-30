import { after } from "next/server";
import { sendApplicationEmail } from "./application-mail";

// The PENDING outbox row was committed with the decision. SMTP must not hold
// the save response open. The existing sender claims each row atomically.
export function scheduleApplicationEmail(id: string) {
  try {
    after(async () => {
      try { await sendApplicationEmail(id); }
      catch { console.warn(JSON.stringify({ operation: "application:email", code: "DELIVERY_DEFERRED" })); }
    });
  } catch {
    // A request lifecycle is unavailable in direct service/CLI calls. Keep the
    // durable PENDING row available for an explicit retry; never claim delivery.
    console.warn(JSON.stringify({ operation: "application:email", code: "DELIVERY_NOT_SCHEDULED" }));
  }
}
