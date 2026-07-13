export type CategoryId = 'fun' | 'views' | 'nature' | 'history' | 'museums' | 'food' | 'rest';

export interface Category {
  id: CategoryId;
  label: string;
  emoji: string;
  color: string;
}

export const CATEGORIES: Category[] = [
  { id: 'fun', label: 'Attractions & Fun', emoji: '🎡', color: '#c2419a' },
  { id: 'views', label: 'Viewpoints', emoji: '🌄', color: '#e07b39' },
  { id: 'nature', label: 'Nature & Parks', emoji: '🌲', color: '#2e8b57' },
  { id: 'history', label: 'History', emoji: '🏰', color: '#8a6d3b' },
  { id: 'museums', label: 'Museums & Culture', emoji: '🏛️', color: '#4169aa' },
  { id: 'food', label: 'Food & Drink', emoji: '🍽️', color: '#d64545' },
  { id: 'rest', label: 'Rest Stops', emoji: '⛽', color: '#6b7b8c' },
];

export const CATEGORY_MAP: Record<CategoryId, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<CategoryId, Category>;

// Typical time (minutes) a traveller spends at each kind of place.
const VISIT_MINUTES: Record<string, number> = {
  viewpoint: 15,
  artwork: 10,
  attraction: 45,
  theme_park: 240,
  zoo: 150,
  aquarium: 120,
  museum: 90,
  gallery: 60,
  monument: 20,
  memorial: 15,
  ruins: 45,
  historic_site: 45,
  restaurant: 60,
  cafe: 30,
  fast_food: 20,
  ice_cream: 15,
  park: 45,
  nature_reserve: 90,
  waterfall: 30,
  beach: 90,
  rest_area: 15,
  services: 20,
  fuel: 10,
  toilets: 10,
  truck_stop: 20,
  charging_station: 30,
};

export function visitMinutes(kind: string): number {
  return VISIT_MINUTES[kind] ?? 30;
}
