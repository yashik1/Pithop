// Affiliate deep links — every partner is optional and env-driven. A button
// renders only when its ID is configured, so the app stays affiliate-free
// until the partner programs approve. All affiliate anchors must use
// rel="sponsored noreferrer", and the sidebar footer shows a disclosure
// whenever any partner is active (FTC "clear and conspicuous" requirement).

const VIATOR_PID = ((import.meta.env.VITE_VIATOR_PID as string | undefined) ?? '').trim();
const GYG_PARTNER_ID = ((import.meta.env.VITE_GYG_PARTNER_ID as string | undefined) ?? '').trim();
const BOOKING_AID = ((import.meta.env.VITE_BOOKING_AID as string | undefined) ?? '').trim();
const UPSIDE_REF_URL = ((import.meta.env.VITE_UPSIDE_REF_URL as string | undefined) ?? '').trim();

export function anyAffiliate(): boolean {
  return Boolean(VIATOR_PID || GYG_PARTNER_ID || BOOKING_AID || UPSIDE_REF_URL);
}

// Stop kinds where "buy a ticket" is a plausible next step.
const TICKET_KINDS = new Set(['attraction', 'theme_park', 'zoo', 'aquarium', 'museum', 'gallery']);

export function ticketsLink(name: string, kind: string): string | null {
  if (!TICKET_KINDS.has(kind)) return null;
  if (VIATOR_PID) {
    return (
      `https://www.viator.com/searchResults/all?text=${encodeURIComponent(name)}` +
      `&pid=${encodeURIComponent(VIATOR_PID)}&mcid=42383&medium=link`
    );
  }
  if (GYG_PARTNER_ID) {
    return `https://www.getyourguide.com/s/?q=${encodeURIComponent(name)}&partner_id=${encodeURIComponent(GYG_PARTNER_ID)}`;
  }
  return null;
}

export function hotelsLink(destination: string): string | null {
  if (!BOOKING_AID || !destination) return null;
  return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(destination)}&aid=${encodeURIComponent(BOOKING_AID)}`;
}

// Upside referral links are personal short links — used as-is.
export function gasCashbackLink(): string | null {
  return UPSIDE_REF_URL || null;
}
