import type { CategoryId } from './lib/categories';

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: CategoryId;
  kind: string;
  visitMin: number;
  source: 'wiki' | 'osm' | 'geoapify';
  description?: string;
  imageUrl?: string;
  wikiUrl?: string;
  offRouteKm: number;
  alongKm: number;
  detourMin: number;
}
