import { deliveryPhotoUrl } from "@/lib/epod-photo";

type Proof = { id: string; proofType: string; photoUrl: string | null; recipientName: string | null; createdAt: Date };

export function DeliveryProofPhotos({ bookingId, proofs }: { bookingId: string; proofs: Proof[] }) {
  const photos = proofs.filter(proof => proof.proofType === "PHOTO" && proof.photoUrl);
  if (!photos.length) return null;
  return (
    <section className="card" style={{ padding: 20, marginTop: 20 }}>
      <h2 style={{ fontSize: 15 }}>Delivery photos</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        {photos.map(proof => (
          <figure key={proof.id} style={{ margin: 0 }}>
            <a href={deliveryPhotoUrl(bookingId, proof.id)} target="_blank" rel="noopener noreferrer" aria-label="Open delivery photo in a new tab">
              {/* Private photos use this app's authenticated route. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={deliveryPhotoUrl(bookingId, proof.id)} alt={proof.recipientName ? `Delivery photo for ${proof.recipientName}` : "Delivery photo"} loading="lazy" style={{ width: "100%", height: 200, objectFit: "contain", borderRadius: 8, background: "var(--bg-muted, #f3f4f6)" }} />
            </a>
            <figcaption className="muted small">
              {proof.recipientName ? `${proof.recipientName} · ` : ""}{proof.createdAt.toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
