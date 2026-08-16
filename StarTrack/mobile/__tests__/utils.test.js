import { computeBillDetails, filterRestaurants, computeCuisineBreakdown, resolveApiBase, mapCheckinMessage } from '../utils';

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
  it('translates known backend messages to guest-facing copy', () => {
    expect(mapCheckinMessage('geofence validation failed')).toMatch(/too far/i);
    expect(mapCheckinMessage('signature validation failed')).toMatch(/couldn't be verified/i);
    expect(mapCheckinMessage('unknown NFC tag')).toMatch(/don't recognize/i);
    expect(mapCheckinMessage('this device has been disabled')).toMatch(/temporarily unavailable/i);
    expect(mapCheckinMessage('recent verified checkin exists')).toMatch(/already checked in/i);
  });

  it('passes unknown messages through unchanged', () => {
    expect(mapCheckinMessage('some new backend message')).toBe('some new backend message');
  });

  it('falls back to a generic message when there is no message at all', () => {
    expect(mapCheckinMessage('')).toBe('Something went wrong — please try again.');
    expect(mapCheckinMessage(undefined)).toBe('Something went wrong — please try again.');
  });
});
