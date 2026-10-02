type Progress = { type: string; status: string; createdAt: Date; matchedAt: Date | null; pickedUpAt: Date | null; deliveredAt: Date | null; cancelledAt: Date | null; updatedAt: Date };
export function BookingTimeline({ booking }: { booking: Progress }) {
  const steps = [
    { label: "Requested", at: booking.createdAt },
    { label: "Rider matched", at: booking.matchedAt },
    { label: booking.type === "RIDE" ? "Passenger picked up" : "Parcel picked up", at: booking.pickedUpAt },
    ...(booking.status === "CANCELLED" ? [{ label: "Cancelled", at: booking.cancelledAt }] : [{ label: booking.type === "RIDE" ? "Ride completed" : "Delivered", at: booking.deliveredAt }]),
  ];
  return <section className="card" style={{ padding: 20, marginBottom: 16 }} aria-labelledby="progress-title"><h2 id="progress-title">Booking timeline</h2><p className="muted small">Last booking update: {booking.updatedAt.toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</p><ol className="booking-timeline">{steps.map(step => <li className={step.at ? "done" : ""} key={step.label}><span className="timeline-dot" aria-hidden="true" /><div><strong>{step.label}</strong><span className="muted small">{step.at ? <time dateTime={step.at.toISOString()}>{step.at.toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</time> : booking.status === "CANCELLED" && step.label !== "Cancelled" ? "No recorded event" : "No timestamp recorded"}</span></div></li>)}</ol></section>;
}
