export const BOOKING_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  MATCHED: "Matched",
  ACCEPTED: "Accepted",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export const VEHICLE_LABEL: Record<string, string> = {
  MOTORCYCLE: "Motorcycle",
  SEDAN: "Sedan",
  CLOSED_VAN: "Closed van",
  FLATBED: "Flatbed",
  REFRIGERATED: "Refrigerated",
};

/**
 * Fares are quoted in whole pesos by the customer app, so the dashboard shows
 * them the same way. Keep this in sync with the customer pricing model.
 */
export const CURRENCY_SYMBOL = "₱";

export function formatPeso(amount: number): string {
  return `${CURRENCY_SYMBOL}${Math.round(amount).toLocaleString("en-PH")}`;
}