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
  community: 30,
};

export function visitMinutes(kind: string): number {
  return VISIT_MINUTES[kind] ?? 30;
}

// One-line "what can I do here?" hint per kind, shown on stop cards and map
// popups so travellers know what to expect before committing to a detour.
const THINGS_TO_DO: Record<string, string> = {
  viewpoint: 'Pull over for panoramic views — great photos and a quick leg stretch.',
  artwork: 'Check out the artwork up close and grab a fun photo with it.',
  attraction: 'A fun roadside stop — look around, take photos and enjoy the novelty.',
  theme_park: 'Rides, shows and games — plan on spending at least half a day.',
  zoo: 'See the animals, catch feeding times and stroll the grounds.',
  aquarium: 'Watch marine life up close and wander the exhibit halls.',
  museum: 'Browse the exhibits and collections; most have restrooms and a gift shop.',
  gallery: 'Wander the galleries and take in the art at your own pace.',
  monument: 'Walk around it, read the plaques and snap a photo.',
  memorial: 'Pause for a quiet moment and learn who or what is honored here.',
  ruins: 'Explore what remains and imagine the history — wear comfortable shoes.',
  historic_site: 'Walk the grounds, read the historic markers and step back in time.',
  restaurant: 'Sit down for a proper meal and a real break from the road.',
  cafe: 'Grab a coffee and a snack, and recharge in a comfy seat.',
  fast_food: 'Quick bite and restrooms — back on the road in minutes.',
  ice_cream: 'Treat yourself to a scoop — the perfect excuse for a short stop.',
  park: 'Stretch your legs on a stroll, find a picnic spot or let the kids run around.',
  nature_reserve: 'Walk a trail, watch for wildlife and enjoy some quiet nature time.',
  waterfall: 'Usually a short walk to the falls — fresh air and great photos.',
  beach: 'Feel the sand, dip your toes in and relax by the water.',
  rest_area: 'Restrooms, parking and often picnic tables — a quick driver reset.',
  services: 'Fuel, food and restrooms in one stop — a full-service break.',
  fuel: 'Fill the tank, stock up on snacks and use the restrooms.',
  toilets: 'Public restrooms for a quick pit stop.',
  truck_stop: 'Fuel, hot food, showers and plenty of parking.',
  charging_station: 'Charge the car and take a breather while you wait.',
  community: 'A traveller-recommended spot — their note says what makes it special.',
};

export function thingsToDo(kind: string): string {
  return THINGS_TO_DO[kind] ?? 'Take a break and have a look around.';
}
