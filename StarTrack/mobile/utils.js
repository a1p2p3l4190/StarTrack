// utils.js — pure logic with zero React Native / Expo imports, pulled out
// of App.jsx and api.js so it's unit-testable without rendering components
// or mocking native modules.

// Simulators/web can reach the backend via localhost. A physical device (or
// Android emulator) needs the dev machine's LAN IP instead, which api.js
// derives from the Expo-detected host and passes in here.
export function resolveApiBase(hostUri, platformOS) {
  if (hostUri && platformOS !== 'web') {
    const host = hostUri.split(':')[0];
    return `http://${host}:8081/api`;
  }
  return 'http://localhost:8081/api';
}

export function computeBillDetails(total, tax, tip, people) {
  const amount = parseFloat(total) || 0;
  const taxRate = parseFloat(tax) || 0;
  const tipRate = parseFloat(tip) || 0;
  const count = Math.max(1, parseInt(people, 10) || 1);

  const taxAmount = amount * (taxRate / 100);
  const tipAmount = amount * (tipRate / 100);
  const totalAmount = amount + taxAmount + tipAmount;

  return {
    subtotal: amount.toFixed(2),
    taxTotal: taxAmount.toFixed(2),
    tipTotal: tipAmount.toFixed(2),
    grandTotal: totalAmount.toFixed(2),
    perPerson: (totalAmount / count).toFixed(2),
  };
}

export function filterRestaurants(restaurants, activeFilter, searchQuery, quickFilters = {}, checkinHistory = {}) {
  return restaurants.filter((r) => {
    if (searchQuery.length > 0 && !r.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (activeFilter.country !== 'All' && r.country !== activeFilter.country) return false;
    if (activeFilter.city !== 'All' && r.city !== activeFilter.city) return false;
    if (activeFilter.cuisine !== 'All' && r.cuisine !== activeFilter.cuisine) return false;
    if (activeFilter.year !== 'All' && r.year !== activeFilter.year) return false;
    if (activeFilter.stars !== 'All' && r.stars !== activeFilter.stars) return false;
    // minRating is a community-rating floor, distinct from the Michelin
    // `stars` tier — a restaurant with no reviews yet (average_rating null)
    // can't satisfy any floor, so it's correctly excluded.
    if (activeFilter.minRating && activeFilter.minRating !== 'All' && !(r.average_rating >= activeFilter.minRating)) return false;
    if (quickFilters.nearby && (r.distance_km == null || r.distance_km > 10)) return false;
    if (quickFilters.openNow && !isRestaurantOpen(r)) return false;
    if (quickFilters.notVisited && checkinHistory[String(r.id)]) return false;
    return true;
  });
}

export function distanceBetweenKm(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every((value) => Number.isFinite(Number(value)))) return null;
  const toRadians = (value) => (Number(value) * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hoursEntryToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Finds today's structured hours entry (see backend RestaurantHours) —
// day_of_week matches JS's Date.getDay() (0=Sunday..6=Saturday).
function todaysHoursEntry(restaurant, date) {
  const hours = Array.isArray(restaurant.hours) ? restaurant.hours : [];
  return hours.find((h) => h.day_of_week === date.getDay());
}

export function isRestaurantOpen(restaurant, date = new Date()) {
  if (typeof restaurant.is_open === 'boolean') return restaurant.is_open;
  const entry = todaysHoursEntry(restaurant, date);
  if (!entry || entry.is_closed || !entry.open_time || !entry.close_time) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  const start = hoursEntryToMinutes(entry.open_time);
  const end = hoursEntryToMinutes(entry.close_time);
  return end < start ? now >= start || now <= end : now >= start && now <= end;
}

// "11:00–22:00" or "Closed" — used to render a single day's row in the
// restaurant detail screen's weekly hours list.
export function formatHoursEntry(entry) {
  if (!entry || entry.is_closed || !entry.open_time || !entry.close_time) return 'Closed';
  return `${entry.open_time}–${entry.close_time}`;
}

// Short one-line summary of today's hours, e.g. "Open 11:00–22:00" or
// "Closed today" — used as the Wishlist snapshot text at add-time (the
// backend's WishlistItem.opening_hours is a free-text field the client
// fills in, decoupled from the restaurant's live structured hours).
export function summarizeTodayHours(restaurant, date = new Date()) {
  const entry = todaysHoursEntry(restaurant, date);
  if (!entry) return 'Hours unavailable';
  if (entry.is_closed || !entry.open_time || !entry.close_time) return 'Closed today';
  return `Open ${entry.open_time}–${entry.close_time}`;
}

// Options are derived from the restaurants actually loaded from the backend
// instead of a hand-maintained static list, so a restaurant in a new
// country/city/cuisine/year (added via the admin panel) is never silently
// unreachable through the filter chips. citiesByCountry.All lists every
// city across all countries, so the City filter is useful even before a
// Country is chosen.
export function deriveFilterOptions(restaurants) {
  const countries = new Set();
  const cuisines = new Set();
  const years = new Set();
  const citiesByCountry = { All: new Set() };

  restaurants.forEach((r) => {
    if (r.country) countries.add(r.country);
    if (r.cuisine) cuisines.add(r.cuisine);
    if (r.year) years.add(r.year);
    if (r.city) {
      citiesByCountry.All.add(r.city);
      if (r.country) {
        if (!citiesByCountry[r.country]) citiesByCountry[r.country] = new Set();
        citiesByCountry[r.country].add(r.city);
      }
    }
  });

  const citiesOut = {};
  Object.entries(citiesByCountry).forEach(([country, set]) => {
    citiesOut[country] = ['All', ...Array.from(set).sort()];
  });

  return {
    countries: ['All', ...Array.from(countries).sort()],
    citiesByCountry: citiesOut,
    cuisines: ['All', ...Array.from(cuisines).sort()],
    // No 'All' here — Year always resolves to a concrete guide edition
    // (defaulting to the latest one), sorted newest-first so `years[0]` is
    // always "the current year" for that default.
    years: Array.from(years).sort((a, b) => b - a),
  };
}

export function sortRestaurants(restaurants, sortBy) {
  const list = [...restaurants];
  switch (sortBy) {
    case 'rating_desc':
      return list.sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0));
    case 'reviews_desc':
      return list.sort((a, b) => (b.review_count || 0) - (a.review_count || 0));
    case 'stars_desc':
      return list.sort((a, b) => b.stars - a.stars);
    case 'name_asc':
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case 'distance_asc':
      return list.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
    default:
      return list;
  }
}

// checkinHistory is the { "<restaurant_id>": {timestamp, shorthand} } map
// from /checkins/me/history. Cross-references each verified restaurant_id
// against the loaded restaurant list to tally cuisine shares — replaces
// what used to be a hardcoded, always-identical RADAR_STATS constant.
export function computeCuisineBreakdown(checkinHistory, restaurants) {
  const counts = {};
  Object.keys(checkinHistory || {}).forEach((restaurantId) => {
    const restaurant = restaurants.find((r) => String(r.id) === restaurantId);
    if (!restaurant || !restaurant.cuisine) return;
    counts[restaurant.cuisine] = (counts[restaurant.cuisine] || 0) + 1;
  });

  const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
  if (total === 0) return [];

  return Object.entries(counts)
    .map(([label, count]) => ({ label, value: Math.round((count / total) * 100) }))
    .sort((a, b) => b.value - a.value);
}

const STAR_TIER_COLORS = { 3: '#d2a14c', 2: '#a8a5ad', 1: '#b76e38' };

// Same cross-reference as computeCuisineBreakdown, but tallied by the
// restaurant's Michelin star tier instead of cuisine — backs the Star
// Statistics pie chart on the Passport screen.
export function computeStarBreakdown(checkinHistory, restaurants) {
  const counts = {};
  Object.keys(checkinHistory || {}).forEach((restaurantId) => {
    const restaurant = restaurants.find((r) => String(r.id) === restaurantId);
    if (!restaurant || !restaurant.stars) return;
    counts[restaurant.stars] = (counts[restaurant.stars] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([stars, count]) => ({
      label: `${stars}★`,
      value: count,
      color: STAR_TIER_COLORS[stars] || '#6b6b70',
    }))
    .sort((a, b) => b.label.localeCompare(a.label));
}

// Maps the backend's terse verify-checkin messages (see
// backend/handlers_checkins.go) to guest-facing copy for the result modal.
// Anything not on this list (network errors, unexpected messages) passes
// through as-is rather than being silently swallowed.
//
// Error-path messages (unknown tag, disabled device, cooldown conflict,
// bad signature) go through RespondError/RespondUnauthorized and arrive
// capitalized ("Unknown NFC tag"); the still-200 geofence-failure message
// is a raw local string on the success path and stays lowercase — keys
// here must match exactly what's actually sent, not what reads naturally.
const CHECKIN_MESSAGE_COPY = {
  'Signature validation failed': "This NFC tag couldn't be verified — please try again or ask staff for help.",
  'geofence validation failed': "You're a bit too far from the venue. Move within 200m of the entrance and try again.",
  'Unknown NFC tag': "We don't recognize this tag yet — please ask staff to confirm the venue's NFC point.",
  'This device has been disabled': 'This check-in point is temporarily unavailable. Please ask staff for assistance.',
  'Recent verified checkin exists': "You already checked in here a few minutes ago — check your Passport, no need to scan again.",
};

export function mapCheckinMessage(message) {
  return CHECKIN_MESSAGE_COPY[message] || message || 'Something went wrong — please try again.';
}
