const API_BASE = 'http://localhost:8081/api'
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
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  return data
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

  users: (search = '') => request(`/users${search ? `?search=${encodeURIComponent(search)}` : ''}`, { auth: true }),
  userHistory: (id) => request(`/users/${id}/history`, { auth: true }),
  banUser: (id) => request(`/users/${id}/ban`, { method: 'POST', auth: true }),
  unbanUser: (id) => request(`/users/${id}/unban`, { method: 'POST', auth: true }),
  manualVerify: (payload) => request('/checkins/manual-verify', { method: 'POST', body: payload, auth: true }),

  adminStats: () => request('/admin/stats', { auth: true }),
  auditLogs: () => request('/audit-logs', { auth: true }),

  cities: () => request('/cities', { auth: true }),
  createCity: (payload) => request('/cities', { method: 'POST', body: payload, auth: true }),
  cuisines: () => request('/cuisines', { auth: true }),
  createCuisine: (payload) => request('/cuisines', { method: 'POST', body: payload, auth: true }),
}
