import type { CategoryId } from './lib/categories';

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: CategoryId;
  kind: string;
  visitMin: number;
  source: 'wiki' | 'osm' | 'geoapify' | 'community';
  description?: string;
  imageUrl?: string;
  wikiUrl?: string;
  // Parking at the spot, when known: free / paid, or 'none' (no on-site parking).
  parking?: 'free' | 'paid' | 'none';
  offRouteKm: number;
  alongKm: number;
  detourMin: number;
}
