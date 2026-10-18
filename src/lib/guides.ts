// The static route guides in public/guides/.
//
// They were written for search engines, and for a while that was all they
// reached: index.html links to them, but that markup lives in the pre-mount
// block React replaces the moment the app loads, so no actual visitor ever saw
// them. This list is what the app itself renders.
//
// Three places know about a guide — these entries, the file on disk, and
// sitemap.xml — and the test alongside this file keeps them from drifting
// apart. A guide nothing links to is a guide nobody reads, which is the exact
// failure this list exists to fix.

export interface RouteGuide {
  /** Path as served; the same form sitemap.xml and index.html use. */
  href: string;
  label: string;
  /** One line on why the drive is worth taking, to earn the click. */
  blurb: string;
}

export const ROUTE_GUIDES: RouteGuide[] = [
  {
    href: '/guides/toronto-to-montreal.html',
    label: 'Toronto → Montreal',
    blurb: 'Waterfronts, history and the Thousand Islands',
  },
  {
    href: '/guides/toronto-to-ottawa.html',
    label: 'Toronto → Ottawa',
    blurb: 'Kingston, Brockville and the Rideau Canal',
  },
  {
    href: '/guides/toronto-to-niagara.html',
    label: 'Toronto → Niagara',
    blurb: 'Nature, small towns and the falls',
  },
];
