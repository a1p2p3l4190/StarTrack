import { computeBillDetails, filterRestaurants, deriveFilterOptions, sortRestaurants, computeCuisineBreakdown, resolveApiBase, mapCheckinMessage, isRestaurantOpen, formatHoursEntry, summarizeTodayHours } from '../utils';

describe('computeBillDetails', () => {
  it('splits a bill across tax, tip, and per-person totals', () => {
    const result = computeBillDetails('100', '10', '20', '4');
    expect(result.subtotal).toBe('100.00');
    expect(result.taxTotal).toBe('10.00');
    expect(result.tipTotal).toBe('20.00');
    expect(result.grandTotal).toBe('130.00');
    expect(result.perPerson).toBe('32.50');
  });

  it('falls back to sane defaults for empty/invalid input', () => {
    const result = computeBillDetails('', '', '', '');
    expect(result.subtotal).toBe('0.00');
    expect(result.grandTotal).toBe('0.00');
    // people defaults to 1, never divides by zero
    expect(result.perPerson).toBe('0.00');
  });

  it('never divides by zero even if people is 0 or negative', () => {
    const result = computeBillDetails('100', '0', '0', '0');
    expect(result.perPerson).toBe('100.00');
  });
});

describe('filterRestaurants', () => {
  const restaurants = [
    { id: 1, name: 'Aurum Table', country: 'USA', city: 'Chicago', cuisine: 'Contemporary', year: 2026, stars: 3 },
    { id: 2, name: 'Celeste Bistro', country: 'USA', city: 'New York', cuisine: 'French', year: 2025, stars: 2 },
    { id: 3, name: "L'Atelier d'Or", country: 'France', city: 'Paris', cuisine: 'French', year: 2026, stars: 3 },
  ];
  const noFilter = { country: 'All', city: 'All', cuisine: 'All', year: 'All', stars: 'All' };

  it('returns everything when no filters or search are active', () => {
    expect(filterRestaurants(restaurants, noFilter, '')).toHaveLength(3);
  });

  it('filters by a single dimension', () => {
    expect(filterRestaurants(restaurants, { ...noFilter, country: 'France' }, '')).toEqual([restaurants[2]]);
    expect(filterRestaurants(restaurants, { ...noFilter, stars: 3 }, '')).toHaveLength(2);
  });

  it('combines multiple filters with search, case-insensitively', () => {
    const result = filterRestaurants(restaurants, { ...noFilter, cuisine: 'French' }, 'celeste');
    expect(result).toEqual([restaurants[1]]);
  });

  it('returns nothing when filters and search don\'t overlap', () => {
    const result = filterRestaurants(restaurants, { ...noFilter, country: 'Japan' }, '');
    expect(result).toHaveLength(0);
  });

  it('filters by a minimum community rating, excluding restaurants with no reviews', () => {
    const rated = [
      { ...restaurants[0], average_rating: 4.5 },
      { ...restaurants[1], average_rating: 3.2 },
      { ...restaurants[2], average_rating: null },
    ];
    expect(filterRestaurants(rated, { ...noFilter, minRating: 4 }, '')).toEqual([rated[0]]);
    expect(filterRestaurants(rated, { ...noFilter, minRating: 'All' }, '')).toHaveLength(3);
  });
});

describe('deriveFilterOptions', () => {
  const restaurants = [
    { id: 1, country: 'USA', city: 'Chicago', cuisine: 'Contemporary', year: 2026 },
    { id: 2, country: 'USA', city: 'New York', cuisine: 'French', year: 2025 },
    { id: 3, country: 'France', city: 'Paris', cuisine: 'French', year: 2026 },
  ];

  it('derives sorted unique option lists from the actual restaurant data', () => {
    const options = deriveFilterOptions(restaurants);
    expect(options.countries).toEqual(['All', 'France', 'USA']);
    expect(options.cuisines).toEqual(['All', 'Contemporary', 'French']);
    // Years never include 'All' — always a concrete guide edition, newest first.
    expect(options.years).toEqual([2026, 2025]);
  });

  it('scopes cities per country but also lists every city under All', () => {
    const options = deriveFilterOptions(restaurants);
    expect(options.citiesByCountry.USA).toEqual(['All', 'Chicago', 'New York']);
    expect(options.citiesByCountry.France).toEqual(['All', 'Paris']);
    expect(options.citiesByCountry.All).toEqual(['All', 'Chicago', 'New York', 'Paris']);
  });

  it('never surfaces a restaurant only reachable through an option missing from the list', () => {
    const withNewCuisine = [...restaurants, { id: 4, country: 'Japan', city: 'Tokyo', cuisine: 'Kaiseki', year: 2027 }];
    const options = deriveFilterOptions(withNewCuisine);
    expect(options.cuisines).toContain('Kaiseki');
    expect(options.countries).toContain('Japan');
    expect(options.years).toContain(2027);
  });
});

describe('sortRestaurants', () => {
  const restaurants = [
    { id: 1, name: 'Bistro B', stars: 2, average_rating: 3.5, review_count: 10 },
    { id: 2, name: 'Aurum A', stars: 3, average_rating: 4.8, review_count: 2 },
    { id: 3, name: 'Celeste C', stars: 1, average_rating: null, review_count: 0 },
  ];

  it('sorts by highest average rating, treating unrated restaurants as lowest', () => {
    const result = sortRestaurants(restaurants, 'rating_desc');
    expect(result.map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it('sorts by most reviews', () => {
    const result = sortRestaurants(restaurants, 'reviews_desc');
    expect(result.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('sorts by Michelin stars', () => {
    const result = sortRestaurants(restaurants, 'stars_desc');
    expect(result.map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it('sorts alphabetically by name', () => {
    const result = sortRestaurants(restaurants, 'name_asc');
    expect(result.map((r) => r.name)).toEqual(['Aurum A', 'Bistro B', 'Celeste C']);
  });

  it('leaves the original order untouched for an unknown/default sort key', () => {
    const result = sortRestaurants(restaurants, 'default');
    expect(result.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('does not mutate the input array', () => {
    const original = [...restaurants];
    sortRestaurants(restaurants, 'name_asc');
    expect(restaurants).toEqual(original);
  });
});

describe('computeCuisineBreakdown', () => {
  const restaurants = [
    { id: 1, cuisine: 'French' },
    { id: 2, cuisine: 'French' },
    { id: 3, cuisine: 'Modern Asian' },
    { id: 4, cuisine: null },
  ];

  it('returns an empty array when there is no check-in history', () => {
    expect(computeCuisineBreakdown({}, restaurants)).toEqual([]);
  });

  it('tallies cuisine shares as percentages, sorted descending', () => {
    const history = { 1: {}, 2: {}, 3: {} };
    const result = computeCuisineBreakdown(history, restaurants);
    expect(result).toEqual([
      { label: 'French', value: 67 },
      { label: 'Modern Asian', value: 33 },
    ]);
  });

  it('ignores checkins for restaurants with no cuisine set or not found locally', () => {
    const history = { 4: {}, 999: {} };
    expect(computeCuisineBreakdown(history, restaurants)).toEqual([]);
  });
});

describe('resolveApiBase', () => {
  it('uses localhost when there is no detected host (simulator/web)', () => {
    expect(resolveApiBase(undefined, 'ios')).toBe('http://localhost:8081/api');
  });

  it('uses localhost on web even if a host was detected', () => {
    expect(resolveApiBase('192.168.1.50:19000', 'web')).toBe('http://localhost:8081/api');
  });

  it('derives the LAN IP from the detected host on a physical device', () => {
    expect(resolveApiBase('192.168.1.50:19000', 'android')).toBe('http://192.168.1.50:8081/api');
  });

  it('strips the port from the detected host, keeping only the hostname/IP', () => {
    expect(resolveApiBase('10.0.0.5:8081', 'ios')).toBe('http://10.0.0.5:8081/api');
  });
});

describe('mapCheckinMessage', () => {
  // These exact strings (capitalization included) are what
  // backend/handlers_checkins.go actually sends — RespondError/
  // RespondUnauthorized capitalize the message, while the still-200
  // geofence-failure message is a raw local string and stays lowercase.
  // A previous version of this test used all-lowercase strings that no
  // real backend response ever sent, which is exactly how a capitalization
  // mismatch here went undetected — assert against the real values, not
  // convenient ones.
  it('translates known backend messages to guest-facing copy', () => {
    expect(mapCheckinMessage('geofence validation failed')).toMatch(/too far/i);
    expect(mapCheckinMessage('Signature validation failed')).toMatch(/couldn't be verified/i);
    expect(mapCheckinMessage('Unknown NFC tag')).toMatch(/don't recognize/i);
    expect(mapCheckinMessage('This device has been disabled')).toMatch(/temporarily unavailable/i);
    expect(mapCheckinMessage('Recent verified checkin exists')).toMatch(/already checked in/i);
  });

  it('passes unknown messages through unchanged', () => {
    expect(mapCheckinMessage('some new backend message')).toBe('some new backend message');
  });

  it('falls back to a generic message when there is no message at all', () => {
    expect(mapCheckinMessage('')).toBe('Something went wrong — please try again.');
    expect(mapCheckinMessage(undefined)).toBe('Something went wrong — please try again.');
  });
});

describe('isRestaurantOpen', () => {
  // Noon on a fixed day — day_of_week derived from it so the test doesn't
  // hardcode which weekday this date lands on.
  const noon = new Date(2026, 0, 7, 12, 0);
  const today = noon.getDay();

  it('short-circuits on a backend-supplied is_open boolean, ignoring hours', () => {
    expect(isRestaurantOpen({ is_open: true, hours: [] }, noon)).toBe(true);
    expect(isRestaurantOpen({ is_open: false, hours: [{ day_of_week: today, open_time: '00:00', close_time: '23:59' }] }, noon)).toBe(false);
  });

  it('reads today\'s structured hours entry when is_open is absent', () => {
    const restaurant = { hours: [{ day_of_week: today, is_closed: false, open_time: '11:00', close_time: '22:00' }] };
    expect(isRestaurantOpen(restaurant, noon)).toBe(true);
    expect(isRestaurantOpen(restaurant, new Date(2026, 0, 7, 23, 0))).toBe(false);
  });

  it('is closed when today\'s entry is marked is_closed', () => {
    const restaurant = { hours: [{ day_of_week: today, is_closed: true, open_time: '', close_time: '' }] };
    expect(isRestaurantOpen(restaurant, noon)).toBe(false);
  });

  it('is closed when there is no entry for today, or no hours at all', () => {
    expect(isRestaurantOpen({ hours: [{ day_of_week: (today + 1) % 7, open_time: '11:00', close_time: '22:00' }] }, noon)).toBe(false);
    expect(isRestaurantOpen({ hours: [] }, noon)).toBe(false);
    expect(isRestaurantOpen({}, noon)).toBe(false);
  });

  it('handles hours that span past midnight', () => {
    const restaurant = { hours: [{ day_of_week: today, is_closed: false, open_time: '22:00', close_time: '02:00' }] };
    expect(isRestaurantOpen(restaurant, new Date(2026, 0, 7, 23, 0))).toBe(true);
    expect(isRestaurantOpen(restaurant, new Date(2026, 0, 7, 1, 0))).toBe(true);
    expect(isRestaurantOpen(restaurant, new Date(2026, 0, 7, 10, 0))).toBe(false);
  });
});

describe('formatHoursEntry', () => {
  it('formats an open entry as a time range', () => {
    expect(formatHoursEntry({ is_closed: false, open_time: '11:00', close_time: '22:00' })).toBe('11:00–22:00');
  });

  it('formats a closed or missing entry as "Closed"', () => {
    expect(formatHoursEntry({ is_closed: true, open_time: '', close_time: '' })).toBe('Closed');
    expect(formatHoursEntry(undefined)).toBe('Closed');
  });
});

describe('summarizeTodayHours', () => {
  const noon = new Date(2026, 0, 7, 12, 0);
  const today = noon.getDay();

  it('summarizes an open entry', () => {
    const restaurant = { hours: [{ day_of_week: today, is_closed: false, open_time: '11:00', close_time: '22:00' }] };
    expect(summarizeTodayHours(restaurant, noon)).toBe('Open 11:00–22:00');
  });

  it('reports closed today', () => {
    const restaurant = { hours: [{ day_of_week: today, is_closed: true, open_time: '', close_time: '' }] };
    expect(summarizeTodayHours(restaurant, noon)).toBe('Closed today');
  });

  it('falls back when there is no hours data at all', () => {
    expect(summarizeTodayHours({ hours: [] }, noon)).toBe('Hours unavailable');
    expect(summarizeTodayHours({}, noon)).toBe('Hours unavailable');
  });
});
