import type { CategoryId } from './lib/categories';

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: CategoryId;
  kind: string;
  visitMin: number;
  source: 'wiki' | 'osm' | 'google';
  description?: string;
  imageUrl?: string;
  wikiUrl?: string;
  rating?: number;
  ratingCount?: number;
  gmapsUri?: string;
  offRouteKm: number;
  alongKm: number;
  detourMin: number;
}
