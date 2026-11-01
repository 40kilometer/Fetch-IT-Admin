import { isSafetyAlert } from "@/lib/safety-alert";
export function SosAlertDetails({ message, priority }: { message: string; priority: string }) {
  if (!isSafetyAlert(message, priority)) return null;
  const match = message.match(/\nGPS: ([^,\n]+), ([^\n]+)\n/);
  const lat = match ? Number(match[1]) : NaN, lng = match ? Number(match[2]) : NaN;
  const valid = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return <section className="card conversation" role="alert"><h2>Urgent safety alert</h2><p>A passenger requested urgent staff review. Check the recorded location, contact the passenger, and follow your incident response procedure. This alert does not dispatch emergency services.</p>{valid && <p><a className="btn" href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noopener noreferrer">Open passenger GPS location ↗</a></p>}</section>;
}
