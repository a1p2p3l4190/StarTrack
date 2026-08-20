// Use the deployed backend URL in production while keeping local development
// convenient when no Vite environment variable is configured.
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8081/api'
const TOKEN_KEY = 'startrack_admin_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && auth) {
      // Session expired (token TTL, backend restart, manual revoke) — bounce
      // back to the login screen instead of leaving the admin stuck staring
      // at a page that will 401 on every subsequent action.
      setToken(null)
      window.location.reload()
    }
    // StandardResponse format: {success: false, error: {code, message, details?, retry_after?}}
    const errorMsg = data?.error?.message || data.error || `Request failed (${res.status})`
    const error = new Error(errorMsg)
    error.code = data?.error?.code || 'UNKNOWN_ERROR'
    error.statusCode = res.status
    if (data?.error?.retry_after) error.retryAfter = data.error.retry_after
    throw error
  }
  // StandardResponse format: {success: true, data, meta?, error?}
  // For backwards compatibility, return data directly but preserve meta if present
  const result = data.data !== undefined ? data.data : data
  if (data.meta) result._meta = data.meta
  // Pagination (page/limit/total) rides as top-level siblings of "data" in
  // the raw response, not inside it — callers like fetchRestaurantTable
  // read `data.total` directly, so it has to be copied onto the unwrapped
  // result or it's silently lost and pagination always reads as empty.
  if (data.total !== undefined) result.total = data.total
  if (data.page !== undefined) result.page = data.page
  if (data.limit !== undefined) result.limit = data.limit
  return result
}

export const api = {
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  me: () => request('/auth/me', { auth: true }),

  restaurants: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/restaurants${qs ? `?${qs}` : ''}`)
  },
  createRestaurant: (payload) => request('/restaurants', { method: 'POST', body: payload, auth: true }),
  updateRestaurant: (id, payload) => request(`/restaurants/${id}`, { method: 'PUT', body: payload, auth: true }),
  deleteRestaurant: (id) => request(`/restaurants/${id}`, { method: 'DELETE', auth: true }),
  restaurant: (id) => request(`/restaurants/${id}`),
  updateRestaurantStarHistory: (id, history) => request(`/restaurants/${id}/star-history`, { method: 'PUT', body: { history }, auth: true }),
  updateRestaurantHours: (id, hours) => request(`/restaurants/${id}/hours`, { method: 'PUT', body: { hours }, auth: true }),
  // Multipart upload — can't go through request() since that always
  // JSON-encodes the body. No explicit Content-Type here either: the
  // browser sets the multipart boundary itself.
  uploadRestaurantPhoto: async (file) => {
    const form = new FormData()
    form.append('photo', file)
    const res = await fetch(`${API_BASE}/uploads/photo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const error = new Error(data?.error?.message || `Upload failed (${res.status})`)
      error.code = data?.error?.code || 'UNKNOWN_ERROR'
      throw error
    }
    return data.data
  },

  nfcDevices: () => request('/nfc-devices', { auth: true }),
  createNfcDevice: (payload) => request('/nfc-devices', { method: 'POST', body: payload, auth: true }),
  updateNfcDevice: (id, payload) => request(`/nfc-devices/${id}`, { method: 'PUT', body: payload, auth: true }),
  updateNfcDeviceStatus: (id, status) => request(`/nfc-devices/${id}/status`, { method: 'PATCH', body: { status }, auth: true }),
  deleteNfcDevice: (id) => request(`/nfc-devices/${id}`, { method: 'DELETE', auth: true }),

  anomalies: (status = '') => request(`/anomalies${status ? `?status=${status}` : ''}`, { auth: true }),
  resolveAnomaly: (id, action) => request(`/anomalies/${id}/resolve`, { method: 'PATCH', body: { action }, auth: true }),
  revokeAnomalyCheckin: (id) => request(`/anomalies/${id}/revoke-checkin`, { method: 'POST', auth: true }),
  disableAnomalyDevice: (id) => request(`/anomalies/${id}/disable-device`, { method: 'POST', auth: true }),
  banAnomalyUser: (id) => request(`/anomalies/${id}/ban-user`, { method: 'POST', auth: true }),

  users: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/users${qs ? `?${qs}` : ''}`, { auth: true })
  },
  userHistory: (id) => request(`/users/${id}/history`, { auth: true }),
  banUser: (id) => request(`/users/${id}/ban`, { method: 'POST', auth: true }),
  unbanUser: (id) => request(`/users/${id}/unban`, { method: 'POST', auth: true }),
  manualVerify: (payload) => request('/checkins/manual-verify', { method: 'POST', body: payload, auth: true }),

  adminStats: () => request('/admin/stats', { auth: true }),
  auditLogs: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/audit-logs${qs ? `?${qs}` : ''}`, { auth: true })
  },
  reports: () => request('/reports', { auth: true }),
  resolveReport: (id, payload) => request(`/reports/${id}/resolve`, { method: 'PATCH', body: payload, auth: true }),

  cities: () => request('/cities', { auth: true }),
  createCity: (payload) => request('/cities', { method: 'POST', body: payload, auth: true }),
  cuisines: () => request('/cuisines', { auth: true }),
  createCuisine: (payload) => request('/cuisines', { method: 'POST', body: payload, auth: true }),
}
