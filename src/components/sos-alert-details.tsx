export function SosAlertDetails({ message, priority }: { message: string; priority: string }) {
  if (priority !== "URGENT" || !message.startsWith("SOS EMERGENCY ALERT\n")) return null;
  const match = message.match(/\nGPS: ([^,\n]+), ([^\n]+)\n/);
  const lat = match ? Number(match[1]) : NaN, lng = match ? Number(match[2]) : NaN;
  const valid = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return <section className="card conversation" role="alert"><h2>SOS emergency alert · Urgent</h2><p>A passenger requested urgent review. Contact the passenger and follow your incident response procedure.</p>{valid && <p><a className="btn" href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noopener noreferrer">Open passenger GPS location ↗</a></p>}</section>;
}
