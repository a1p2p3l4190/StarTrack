// api.js — thin fetch wrapper around the StarTrack Go backend.
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { resolveApiBase } from './utils';

// Simulators/web can reach the backend via localhost. A physical device (or
// Android emulator) needs the dev machine's LAN IP instead, which we derive
// from the same host Expo/Metro was already reached through.
const detectedHostUri = Constants.expoConfig?.hostUri || Constants.expoGoConfig?.debuggerHost;
export const API_BASE = resolveApiBase(detectedHostUri, Platform.OS);

// SecureStore wraps iOS Keychain / Android Keystore — hardware-backed
// encryption at rest, not just "somewhere on disk" like AsyncStorage. It has
// no web implementation, so web keeps the old in-memory-only behavior (a
// page reload there just means signing in again, which is a fine tradeoff
// for a browser tab that isn't carrying the same "device gets stolen" risk).
const TOKEN_KEY = 'startrack_auth_token';
const SECURE_STORE_AVAILABLE = Platform.OS !== 'web';

let authToken = null;

export async function setAuthToken(token) {
  authToken = token;
  if (!SECURE_STORE_AVAILABLE) return;
  try {
    if (token) {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
  } catch (err) {
    console.warn('Failed to persist auth token securely', err.message);
  }
}

// Called once at app boot to restore a session from a previous launch.
// Returns the token (also caching it in memory) or null if there isn't one.
export async function loadStoredAuthToken() {
  if (!SECURE_STORE_AVAILABLE) return null;
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    authToken = token;
    return token;
  } catch (err) {
    console.warn('Failed to read stored auth token', err.message);
    return null;
  }
}

export function getAuthToken() {
  return authToken;
}

// Set by App.jsx at mount so a 401 (expired/invalid token, backend restart)
// can bounce the user back to the login screen instead of just throwing an
// error that leaves them stuck on a screen that will 401 on every retry.
let unauthorizedHandler = null;
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

// Thrown only when we genuinely don't know what happened server-side (the
// request never got a response at all — dropped connection, timeout). A
// handler can catch this specifically to warn "this may have gone through
// anyway" instead of treating it the same as a clean rejection from the
// backend (bad signature, cooldown, etc.), which throws a plain Error below.
export class NetworkError extends Error {}

const DEFAULT_TIMEOUT_MS = 15000;

async function request(path, { method = 'GET', body, auth = false, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    throw new NetworkError(
      err.name === 'AbortError'
        ? 'Request timed out — the server took too long to respond.'
        : (err.message || 'Network request failed.')
    );
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && auth) {
      await setAuthToken(null);
      if (unauthorizedHandler) unauthorizedHandler();
    }
    // StandardResponse format: {success: false, error: {code, message, retry_after?}}
    const errorMsg = data?.error?.message || data.error || `Request failed (${res.status})`;
    const error = new Error(errorMsg);
    error.code = data?.error?.code || 'UNKNOWN_ERROR';
    error.statusCode = res.status;
    if (data?.error?.retry_after) error.retryAfter = data.error.retry_after;
    throw error;
  }
  // StandardResponse format: {success: true, data, meta?, error?}
  // For backwards compatibility, return data directly but preserve meta if present
  const result = data.data !== undefined ? data.data : data;
  if (data.meta) result._meta = data.meta;
  return result;
}

export const api = {
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  me: () => request('/auth/me', { auth: true }),
  updateMe: (payload) => request('/auth/me', { method: 'PUT', body: payload, auth: true }),
  changePassword: (payload) => request('/auth/change-password', { method: 'POST', body: payload, auth: true }),
  forgotPassword: (payload) => request('/auth/forgot-password', { method: 'POST', body: payload }),
  resetPassword: (payload) => request('/auth/reset-password', { method: 'POST', body: payload }),
  sendVerificationEmail: () => request('/auth/send-verification-email', { method: 'POST', auth: true }),
  verifyEmail: (payload) => request('/auth/verify-email', { method: 'POST', body: payload }),
  deleteAccount: (payload) => request('/auth/me', { method: 'DELETE', body: payload, auth: true }),

  restaurants: () => request('/restaurants'),
  restaurant: (id) => request(`/restaurants/${id}`),

  reviews: (restaurantId) => request(`/restaurants/${restaurantId}/reviews`),
  reviewEligibility: (restaurantId) =>
    request(`/restaurants/${restaurantId}/review-eligibility`, { auth: true }),
  createReview: (restaurantId, payload) =>
    request(`/restaurants/${restaurantId}/reviews`, { method: 'POST', body: payload, auth: true }),
  updateReview: (reviewId, payload) =>
    request(`/reviews/${reviewId}`, { method: 'PUT', body: payload, auth: true }),
  deleteReview: (reviewId) =>
    request(`/reviews/${reviewId}`, { method: 'DELETE', auth: true }),

  // Simulates reading a physical NFC tag (which would already be etched
  // with {tag_id, signature} at provisioning time). Real hardware would
  // read this off the tag directly instead of asking the backend for it.
  simulateNfcScan: (restaurantId) => request(`/restaurants/${restaurantId}/simulate-nfc-scan`),
  verifyCheckin: (payload) => request('/checkins/verify', { method: 'POST', body: payload, auth: true }),
  checkinHistory: () => request('/checkins/me/history', { auth: true }),
  passport: () => request('/checkins/me/passport', { auth: true }),

  badges: () => request('/badges', { auth: true }),
  leaderboard: () => request('/leaderboard'),

  wishlist: () => request('/wishlist', { auth: true }),
  addWishlist: (payload) => request('/wishlist', { method: 'POST', body: payload, auth: true }),
  removeWishlist: (id) => request(`/wishlist/${id}`, { method: 'DELETE', auth: true }),

  socialStats: (userId) => request(`/social/users/${userId}/stats`, { auth: true }),
  toggleFollow: (userId) => request(`/social/users/${userId}/follow`, { method: 'POST', auth: true }),
  badgeWall: (userId) => request(`/social/users/${userId}/badge-wall`, { auth: true }),
  reportReview: (reviewId, payload) => request(`/reviews/${reviewId}/report`, { method: 'POST', body: payload, auth: true }),

  notifications: () => request('/notifications', { auth: true }),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'POST', auth: true }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'POST', auth: true }),
};
