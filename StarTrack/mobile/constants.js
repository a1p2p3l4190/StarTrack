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

// Country/city/cuisine/year filter options are no longer hardcoded here —
// they're derived at runtime from the actual restaurants the backend
// returns (see utils.deriveFilterOptions), so a restaurant added via the
// admin panel in a new country/city/cuisine/year is never invisible to
// every filter chip except a name search.

// The Michelin scale is fixed by definition (1-3 stars), unlike the other
// filters above — a real fixed domain, not restaurant-data-dependent.
export const STARS_LEVELS = ['All', 1, 2, 3];

// Community-rating floor filter, distinct from the Michelin tier.
export const RATING_LEVELS = ['All', 3, 4, 4.5];

export const SORT_OPTIONS = [
  { key: 'default', label: 'Default' },
  { key: 'rating_desc', label: 'Highest Rated' },
  { key: 'reviews_desc', label: 'Most Reviewed' },
  { key: 'stars_desc', label: 'Michelin Stars' },
  { key: 'name_asc', label: 'Name A–Z' },
  { key: 'distance_asc', label: 'Nearest' },
];

export const BADGE_CATEGORIES = ['All', 'Michelin', 'Regional', 'Social'];
