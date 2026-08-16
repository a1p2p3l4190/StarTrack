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

export function filterRestaurants(restaurants, activeFilter, searchQuery) {
  return restaurants.filter((r) => {
    if (searchQuery.length > 0 && !r.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (activeFilter.country !== 'All' && r.country !== activeFilter.country) return false;
    if (activeFilter.city !== 'All' && r.city !== activeFilter.city) return false;
    if (activeFilter.cuisine !== 'All' && r.cuisine !== activeFilter.cuisine) return false;
    if (activeFilter.year !== 'All' && r.year !== activeFilter.year) return false;
    if (activeFilter.stars !== 'All' && r.stars !== activeFilter.stars) return false;
    return true;
  });
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

// Maps the backend's terse verify-checkin messages (see
// backend/handlers_checkins.go) to guest-facing copy for the result modal.
// Anything not on this list (network errors, unexpected messages) passes
// through as-is rather than being silently swallowed.
const CHECKIN_MESSAGE_COPY = {
  'signature validation failed': "This NFC tag couldn't be verified — please try again or ask staff for help.",
  'geofence validation failed': "You're a bit too far from the venue. Move within 200m of the entrance and try again.",
  'unknown NFC tag': "We don't recognize this tag yet — please ask staff to confirm the venue's NFC point.",
  'this device has been disabled': 'This check-in point is temporarily unavailable. Please ask staff for assistance.',
  'recent verified checkin exists': "You already checked in here a few minutes ago — check your Passport, no need to scan again.",
};

export function mapCheckinMessage(message) {
  return CHECKIN_MESSAGE_COPY[message] || message || 'Something went wrong — please try again.';
}
