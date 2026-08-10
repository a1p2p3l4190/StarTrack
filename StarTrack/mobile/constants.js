// constants.js
//
// Restaurants, reviews, badges, leaderboard, and wishlist all now come from
// the StarTrack backend (see api.js). What's left here is static UI
// metadata: filter option lists and the passport grid's decorative shape.

export const PASSPORT_DATES = Array.from({ length: 28 }, (_, index) => ({
  day: index + 1,
  verified: index % 5 === 0,
  tier: index % 10 === 0 ? 'gold' : 'red',
}));

export const COUNTRIES = ['All', 'USA', 'France', 'Japan'];
export const CITIES = {
  All: ['All'],
  USA: ['All', 'Chicago', 'New York', 'San Francisco'],
  France: ['All', 'Paris'],
  Japan: ['All', 'Tokyo']
};

export const CUISINES = ['All', 'Contemporary', 'French', 'Modern Asian'];
export const YEARS = ['All', 2025, 2026];
export const STARS_LEVELS = ['All', 1, 2, 3];

export const BADGE_CATEGORIES = ['All', 'Michelin', 'Regional', 'Social'];
