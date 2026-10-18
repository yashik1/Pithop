// Affiliate deep links — every partner is optional and env-driven. A button
// renders only when its ID is configured, so the app stays affiliate-free
// until the partner programs approve. All affiliate anchors must use
// rel="sponsored noreferrer", and the sidebar footer shows a disclosure
// whenever any partner is active (FTC "clear and conspicuous" requirement).
//
// These are read from import.meta.env, which Vite inlines AT BUILD TIME. Adding
// an ID to the hosting dashboard therefore does nothing until the site is
// redeployed — there is no runtime lookup to pick it up.

const VIATOR_PID = ((import.meta.env.VITE_VIATOR_PID as string | undefined) ?? '').trim();
const GYG_PARTNER_ID = ((import.meta.env.VITE_GYG_PARTNER_ID as string | undefined) ?? '').trim();
const BOOKING_AID = ((import.meta.env.VITE_BOOKING_AID as string | undefined) ?? '').trim();
const UPSIDE_REF_URL = ((import.meta.env.VITE_UPSIDE_REF_URL as string | undefined) ?? '').trim();

export function anyAffiliate(): boolean {
  return Boolean(VIATOR_PID || GYG_PARTNER_ID || BOOKING_AID || UPSIDE_REF_URL);
}

// Stop kinds where "buy a ticket" is a plausible next step.
//
// Every kind here must actually be produced by one of the sources in src/api,
// or the entry is dead. `historic_site` is included because it is what both
// Geoapify's tourism.sights and Wikipedia's historic rule return, and castles,
// forts and heritage sites are routinely ticketed. Monuments, memorials and
// viewpoints are deliberately absent: they are free, and a "Book tickets"
// button on a war memorial would be crass.
const TICKET_KINDS = new Set([
  'attraction',
  'theme_park',
  'zoo',
  'aquarium',
  'museum',
  'gallery',
  'historic_site',
]);

export interface TicketLink {
  /** Stable identifier — also the React key. */
  partner: 'viator' | 'getyourguide';
  /** Brand name shown to the traveller. Never translated; it is a brand. */
  label: string;
  url: string;
}

/**
 * Ticket-booking links for a stop, one per configured partner.
 *
 * Returns every partner rather than the first match on purpose. An earlier
 * version fell through Viator -> GetYourGuide, which meant that configuring
 * both silently made the second unreachable: Viator always won, and the
 * GetYourGuide program earned nothing while appearing to be set up.
 *
 * Each link is a SEARCH on the partner's own site rather than a product page,
 * because the app only knows a place name — it has no product IDs — and a
 * search lands the traveller somewhere real even when the partner has no
 * listing for that exact place.
 */
export function ticketLinks(name: string, kind: string): TicketLink[] {
  if (!TICKET_KINDS.has(kind) || !name.trim()) return [];
  const links: TicketLink[] = [];
  if (VIATOR_PID) {
    links.push({
      partner: 'viator',
      label: 'Viator',
      // pid / mcid / medium is Viator's documented tracking triple. Their docs
      // warn that altering or dropping `medium` breaks attribution reporting.
      url:
        `https://www.viator.com/searchResults/all?text=${encodeURIComponent(name)}` +
        `&pid=${encodeURIComponent(VIATOR_PID)}&mcid=42383&medium=link`,
    });
  }
  if (GYG_PARTNER_ID) {
    links.push({
      partner: 'getyourguide',
      label: 'GetYourGuide',
      url: `https://www.getyourguide.com/s/?q=${encodeURIComponent(name)}&partner_id=${encodeURIComponent(GYG_PARTNER_ID)}`,
    });
  }
  return links;
}

export function hotelsLink(destination: string): string | null {
  if (!BOOKING_AID || !destination) return null;
  return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(destination)}&aid=${encodeURIComponent(BOOKING_AID)}`;
}

// Upside referral links are personal short links — used as-is.
export function gasCashbackLink(): string | null {
  return UPSIDE_REF_URL || null;
}
