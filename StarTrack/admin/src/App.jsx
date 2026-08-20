import { useEffect, useMemo, useRef, useState } from 'react'
import './styles.css'
import { api, getToken, setToken } from './api'
import { CheckinTrendChart, CityBreakdownChart } from './DashboardCharts'
import ErrorBoundary from './ErrorBoundary'

function nextTagId(devices) {
  let max = 0
  devices.forEach((d) => {
    const match = /^TAG-(\d+)$/.exec(d.tag_id || '')
    if (match) max = Math.max(max, parseInt(match[1], 10))
  })
  return `TAG-${String(max + 1).padStart(6, '0')}`
}

function generateSalt() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function maskSalt(salt) {
  if (!salt || salt.length <= 8) return '••••••••'
  return `${salt.slice(0, 4)}…${salt.slice(-4)}`
}

function restaurantLabel(r) {
  return `${r.name} — ${r.city} — ${'★'.repeat(r.stars)}`
}

function downloadCsv(filename, header, rows) {
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Toast notifications replace the old single status banner so success and
// error feedback can stack and auto-dismiss instead of overwriting itself.
function useToasts() {
  const [toasts, setToasts] = useState([])
  function push(type, message) {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, type, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }
  function dismiss(id) {
    setToasts((t) => t.filter((x) => x.id !== id))
  }
  return { toasts, push, dismiss }
}

function ToastStack({ toasts, onDismiss }) {
  if (toasts.length === 0) return null
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`toast toast-${t.type}`}
          onClick={() => onDismiss(t.id)}
          aria-label={`${t.type === 'error' ? 'Error' : 'Success'}: ${t.message}. Dismiss`}
        >
          {t.message}
        </button>
      ))}
    </div>
  )
}

// Tracks in-flight async actions by an arbitrary string key, so a button can
// disable itself (and only itself) while its own request is outstanding —
// guards against double-submits from a slow network + an impatient click.
function useActionGuard() {
  const [pending, setPending] = useState(() => new Set())
  async function run(key, fn) {
    if (pending.has(key)) return
    setPending((p) => new Set(p).add(key))
    try {
      await fn()
    } finally {
      setPending((p) => {
        const next = new Set(p)
        next.delete(key)
        return next
      })
    }
  }
  function isPending(key) {
    return pending.has(key)
  }
  return { run, isPending }
}

function SkeletonStack({ count = 4, height = 40, style }) {
  return (
    <div className="skeleton-stack" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-row" style={{ height, ...style }} />
      ))}
    </div>
  )
}

// Clickable <th> for tables with sortable columns. `sort` is {key, dir};
// clicking the active column flips direction, clicking a new one starts asc.
function SortableTh({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey
  return (
    <th aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sort-th" onClick={() => onSort(sortKey)}>
        {label}{active && <span aria-hidden="true">{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
      </button>
    </th>
  )
}

function toggleSort(current, key) {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: 'asc' }
}

function StatusBadge({ active, activeLabel, inactiveLabel }) {
  return (
    <span className={active ? 'status-badge status-active' : 'status-badge status-disabled'}>
      {active ? activeLabel : inactiveLabel}
    </span>
  )
}

// Typeable dropdown: a text input backed by a <datalist>, so admins can
// either pick an existing option or type a new value. When `onAddOption`
// is supplied, a "+" reveals a small inline field to persist a brand new
// option (e.g. a city that doesn't exist yet). Only used for free-text
// picklists (city/cuisine) — never for selecting a specific restaurant,
// since two restaurants can share a name and text matching would be
// ambiguous (see RestaurantSelect for that case).
function TypeaheadInput({ id, label, value, onChange, options, placeholder, onAddOption, addLabel }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  async function handleAdd(e) {
    e.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed) return
    try {
      await onAddOption(trimmed)
      onChange(trimmed)
      setDraft('')
      setAdding(false)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <label>
      {label}
      <div className="combo-row">
        <input list={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        <datalist id={id}>
          {options.map((opt) => (
            <option key={opt} value={opt} />
          ))}
        </datalist>
        {onAddOption && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => setAdding((v) => !v)}
            title={addLabel || 'Add option'}
            aria-label={addLabel || 'Add option'}
          >
            +
          </button>
        )}
      </div>
      {adding && (
        <div className="combo-add-row">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={addLabel || 'Enter new option'} />
          <button type="button" className="icon-btn" onClick={handleAdd}>Add</button>
        </div>
      )}
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}

// Selects a restaurant by ID (never by name) — a native <select> is still
// keyboard-searchable, but every option resolves to exactly one row even
// when two restaurants share a name (different branch, different city).
function RestaurantSelect({ label, value, onChange, restaurants, placeholder }) {
  return (
    <label>
      {label}
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">{placeholder || 'Select a restaurant'}</option>
        {restaurants.map((r) => (
          <option key={r.id} value={r.id}>{restaurantLabel(r)}</option>
        ))}
      </select>
    </label>
  )
}

function LoginPanel({ onAuthenticated }) {
  const [email, setEmail] = useState('admin@startrack.app')
  const [password, setPassword] = useState('StarTrack123!')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api.login({ email, password })
      if (data.user.role !== 'admin') {
        throw new Error('This account does not have admin access.')
      }
      setToken(data.token)
      onAuthenticated(data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-shell" style={{ maxWidth: 420, paddingTop: 120 }}>
      <div className="panel-card">
        <h1>StarTrack Admin</h1>
        <p>Sign in with an admin account to manage restaurants, NFC inventory, and security review.</p>
      </div>
      <div className="form-card" style={{ marginTop: 24 }}>
        <form onSubmit={submit} className="admin-form">
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </label>
          <label>
            Password
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
          </label>
          {error ? <p style={{ color: '#ff6b6b', fontSize: 13 }}>{error}</p> : null}
          <button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
        </form>
        <p style={{ fontSize: 12, opacity: 0.6, marginTop: 12 }}>Demo login: admin@startrack.app / StarTrack123!</p>
      </div>
    </div>
  )
}

const RESTAURANT_PAGE_SIZE = 10
const USER_PAGE_SIZE = 20
const DEVICE_PAGE_SIZE = 20
const AUDIT_PAGE_SIZE = 20
const EMPTY_RESTAURANT_FORM = { name: '', city: '', cuisine: '', stars: 1, year_awarded: 2026, reservation_release_day: 0, price_tier: 0, reservation_platform: '', reservation_url: '', photo_url: '' }
const RESERVATION_PLATFORMS = [
  { value: '', label: 'None' },
  { value: 'opentable', label: 'OpenTable' },
  { value: 'resy', label: 'Resy' },
  { value: 'website', label: "Restaurant's website" },
]

// day_of_week matches JS's Date.getDay() (0=Sunday..6=Saturday), the same
// convention the backend's RestaurantHours uses.
const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function clampStars(value) {
  return Math.min(3, Math.max(1, Math.round(value) || 1))
}

function clampPriceTier(value) {
  return Math.min(3, Math.max(0, Math.round(value) || 0))
}

// Always renders a full Sun-Sat week in the editor, filling in any day
// missing from the saved set as closed/unset.
function fillWeekHours(hours) {
  const byDay = new Map((hours || []).map((h) => [h.day_of_week, h]))
  return WEEKDAY_LABELS.map((_, day) => byDay.get(day) || { day_of_week: day, is_closed: true, open_time: '', close_time: '' })
}

export default function App() {
  const [currentAdmin, setCurrentAdmin] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const toast = useToasts()
  const guard = useActionGuard()

  const [tab, setTab] = useState('dashboard')
  const [globalSearch, setGlobalSearch] = useState('')

  // Full, unpaginated restaurant list — backs every dropdown/typeahead in
  // the app (NFC provisioning, reassignment, manual check-in).
  const [restaurants, setRestaurants] = useState([])
  const [devices, setDevices] = useState([])
  const [anomalies, setAnomalies] = useState([])
  const [anomalyStatusFilter, setAnomalyStatusFilter] = useState('open')
  const [cities, setCities] = useState([])
  const [cuisines, setCuisines] = useState([])
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])
  const [reports, setReports] = useState([])
  const [selectedUserIds, setSelectedUserIds] = useState(new Set())

  // Restaurant Engine's own paginated/searchable table view
  const [restaurantTableRows, setRestaurantTableRows] = useState([])
  const [restaurantTableTotal, setRestaurantTableTotal] = useState(0)
  const [restaurantSearch, setRestaurantSearch] = useState('')
  const [restaurantPage, setRestaurantPage] = useState(1)
  const [restaurantSort, setRestaurantSort] = useState({ key: 'stars', dir: 'desc' })
  const [editingRestaurantId, setEditingRestaurantId] = useState(null)
  const [restaurantForm, setRestaurantForm] = useState(EMPTY_RESTAURANT_FORM)
  const [starHistoryForm, setStarHistoryForm] = useState([])
  // Only true once the current restaurant's history has actually been
  // fetched — guards submitRestaurant from overwriting real history with an
  // empty array if that fetch failed or hasn't resolved yet.
  const [starHistoryLoaded, setStarHistoryLoaded] = useState(false)
  const [hoursForm, setHoursForm] = useState([])
  // Same guard as starHistoryLoaded, for the weekly hours editor.
  const [hoursLoaded, setHoursLoaded] = useState(false)
  // Tracks which restaurant's history fetch is the most recent one
  // requested — without it, clicking Edit on A then quickly on B before A's
  // fetch resolves would let A's history land in the form after B's own
  // fetch already applied, silently attaching A's history to B on save.
  const editingRestaurantRequestRef = useRef(null)

  const [deviceForm, setDeviceForm] = useState({ tag_id: '', salt: '' })
  const [nfcFilters, setNfcFilters] = useState({ year: '', city: '', cuisine: '' })
  const [deviceRestaurantId, setDeviceRestaurantId] = useState(null)
  const [revealSalts, setRevealSalts] = useState(false)
  const [reassigningDeviceId, setReassigningDeviceId] = useState(null)
  const [reassignRestaurantId, setReassignRestaurantId] = useState(null)
  // Devices table's own search/sort/pagination — layered client-side on top
  // of the full `devices` list, which other features (tag-ID generation,
  // CSV export, the dashboard's disabled-device count, global search) all
  // still need in full.
  const [deviceSearch, setDeviceSearch] = useState('')
  const [devicePage, setDevicePage] = useState(1)
  const [deviceSort, setDeviceSort] = useState({ key: 'created_at', dir: 'desc' })

  const [userSearch, setUserSearch] = useState('')
  const [userPage, setUserPage] = useState(1)
  const [userSort, setUserSort] = useState({ key: 'created_at', dir: 'desc' })
  const [usersTotal, setUsersTotal] = useState(0)
  // Separate from the Users tab's own paginated `users` list — the global
  // search bar needs to match across every user, not just the current page.
  const [globalUserMatches, setGlobalUserMatches] = useState([])
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [selectedUserHistory, setSelectedUserHistory] = useState(null)
  const [manualVerifyForm, setManualVerifyForm] = useState({ restaurant_id: null, note: '' })
  const [auditSearch, setAuditSearch] = useState('')
  const [auditPage, setAuditPage] = useState(1)
  const [auditSort, setAuditSort] = useState({ key: 'created_at', dir: 'desc' })
  const [auditLogsTotal, setAuditLogsTotal] = useState(0)
  const restaurantFormInitialRef = useRef(JSON.stringify(EMPTY_RESTAURANT_FORM))

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setAuthChecked(true)
      return
    }
    api.me()
      .then((user) => {
        if (user.role === 'admin') setCurrentAdmin(user)
        else setToken(null)
      })
      .catch(() => setToken(null))
      .finally(() => setAuthChecked(true))
  }, [])

  useEffect(() => {
    if (!currentAdmin) return
    fetchRestaurants()
    fetchDevices()
    fetchCities()
    fetchCuisines()
    fetchStats()
    fetchReports()
  }, [currentAdmin])

  useEffect(() => {
    if (!currentAdmin) return
    fetchAnomalies()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAdmin, anomalyStatusFilter])

  useEffect(() => {
    if (!currentAdmin) return
    const t = setTimeout(() => fetchRestaurantTable(), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAdmin, restaurantSearch, restaurantPage, restaurantSort])

  useEffect(() => {
    if (!currentAdmin) return
    const t = setTimeout(() => fetchUsers(), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAdmin, userSearch, userPage, userSort])

  // Selection is page-scoped (bulkBanUsers only acts on rows in the
  // currently loaded page), so clear it whenever the page/search/sort
  // changes underneath it rather than leaving stale, invisible selections.
  useEffect(() => {
    setSelectedUserIds(new Set())
  }, [userPage, userSearch, userSort])

  useEffect(() => {
    if (!currentAdmin) return
    const t = setTimeout(() => fetchAuditLogs(), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAdmin, auditSearch, auditPage, auditSort])

  // Global search bar needs to match users beyond whatever page the Users
  // tab happens to have loaded, so it queries the backend directly instead
  // of filtering the (now paginated) `users` state.
  useEffect(() => {
    if (!currentAdmin) return
    const query = globalSearch.trim()
    if (!query) {
      setGlobalUserMatches([])
      return
    }
    const t = setTimeout(() => {
      api.users({ search: query, limit: 5 }).then((data) => setGlobalUserMatches(data.users || [])).catch(() => setGlobalUserMatches([]))
    }, 250)
    return () => clearTimeout(t)
  }, [currentAdmin, globalSearch])

  const restaurantFormDirty = editingRestaurantId !== null && JSON.stringify(restaurantForm) !== restaurantFormInitialRef.current

  useEffect(() => {
    function warnBeforeLeave(event) {
      if (!restaurantFormDirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeave)
    return () => window.removeEventListener('beforeunload', warnBeforeLeave)
  }, [restaurantFormDirty])

  // Tag ID is always a fresh auto-incrementing serial; salt is only
  // (re)generated when it's empty, so an in-progress "Regenerate" click
  // isn't clobbered by an unrelated devices refresh.
  useEffect(() => {
    setDeviceForm((f) => ({ tag_id: nextTagId(devices), salt: f.salt || generateSalt() }))
  }, [devices])

  async function fetchRestaurants() {
    try {
      const data = await api.restaurants()
      setRestaurants(data.restaurants || [])
    } catch (err) {
      toast.push('error', `Failed to load restaurants: ${err.message}`)
    }
  }

  async function fetchRestaurantTable() {
    try {
      const params = { limit: RESTAURANT_PAGE_SIZE, page: restaurantPage, sort: restaurantSort.key, order: restaurantSort.dir }
      if (restaurantSearch) params.q = restaurantSearch
      const data = await api.restaurants(params)
      setRestaurantTableRows(data.restaurants || [])
      setRestaurantTableTotal(data.total || 0)
    } catch (err) {
      toast.push('error', `Failed to load restaurants: ${err.message}`)
    }
  }

  async function fetchDevices() {
    try {
      const data = await api.nfcDevices()
      setDevices(data.devices || [])
    } catch (err) {
      toast.push('error', `Failed to load NFC devices: ${err.message}`)
    }
  }

  async function fetchAnomalies() {
    try {
      const data = await api.anomalies(anomalyStatusFilter)
      setAnomalies(data.anomalies || [])
    } catch (err) {
      toast.push('error', `Failed to load anomalies: ${err.message}`)
    }
  }

  async function fetchCities() {
    try {
      const data = await api.cities()
      setCities(data.cities || [])
    } catch (err) {
      toast.push('error', `Failed to load cities: ${err.message}`)
    }
  }

  async function fetchCuisines() {
    try {
      const data = await api.cuisines()
      setCuisines(data.cuisines || [])
    } catch (err) {
      toast.push('error', `Failed to load cuisines: ${err.message}`)
    }
  }

  async function fetchUsers() {
    try {
      const params = { limit: USER_PAGE_SIZE, page: userPage, sort: userSort.key, order: userSort.dir }
      if (userSearch) params.search = userSearch
      const data = await api.users(params)
      setUsers(data.users || [])
      setUsersTotal(data.total || 0)
    } catch (err) {
      toast.push('error', `Failed to load users: ${err.message}`)
    }
  }

  async function fetchStats() {
    try {
      const data = await api.adminStats()
      setStats(data)
    } catch (err) {
      toast.push('error', `Failed to load dashboard stats: ${err.message}`)
    }
  }

  async function fetchAuditLogs() {
    try {
      const params = { limit: AUDIT_PAGE_SIZE, page: auditPage, sort: auditSort.key, order: auditSort.dir }
      if (auditSearch) params.search = auditSearch
      const data = await api.auditLogs(params)
      setAuditLogs(data.audit_logs || [])
      setAuditLogsTotal(data.total || 0)
    } catch (err) {
      toast.push('error', `Failed to load audit log: ${err.message}`)
    }
  }

  async function fetchReports() {
    try {
      const data = await api.reports()
      setReports(data.reports || [])
    } catch (err) {
      toast.push('error', `Failed to load review reports: ${err.message}`)
    }
  }

  async function handleReportAction(reportId, action) {
    await guard.run(`report-${action}-${reportId}`, async () => {
      try {
        await api.resolveReport(reportId, { action })
        toast.push('success', action === 'dismiss' ? 'Report dismissed' : 'Review deleted')
        fetchReports()
      } catch (err) {
        toast.push('error', err.message)
      }
    })
  }

  async function refreshRestaurantViews() {
    await Promise.all([fetchRestaurants(), fetchRestaurantTable(), fetchStats()])
  }

  const restaurantYears = useMemo(
    () => Array.from(new Set(restaurants.map((r) => String(r.year_awarded)).filter((y) => y && y !== 'undefined'))).sort((a, b) => b - a),
    [restaurants]
  )

  const filteredRestaurants = useMemo(() => {
    return restaurants.filter((r) => {
      if (nfcFilters.year && String(r.year_awarded) !== nfcFilters.year) return false
      if (nfcFilters.city && r.city !== nfcFilters.city) return false
      if (nfcFilters.cuisine && r.cuisine !== nfcFilters.cuisine) return false
      return true
    })
  }, [restaurants, nfcFilters])

  const matchedRestaurant = useMemo(
    () => filteredRestaurants.find((r) => r.id === deviceRestaurantId),
    [filteredRestaurants, deviceRestaurantId]
  )

  const restaurantNameById = useMemo(() => {
    const map = new Map()
    restaurants.forEach((r) => map.set(r.id, r.name))
    return map
  }, [restaurants])

  // Devices table's search/sort/pagination run entirely client-side over
  // the full `devices` list (see the state comment above for why it isn't
  // server-paginated).
  const sortedFilteredDevices = useMemo(() => {
    const query = deviceSearch.trim().toLowerCase()
    let rows = devices
    if (query) {
      rows = rows.filter((d) => {
        const restaurantName = restaurantNameById.get(d.restaurant_id) || ''
        return d.tag_id.toLowerCase().includes(query) || restaurantName.toLowerCase().includes(query) || d.status.toLowerCase().includes(query)
      })
    }
    const fieldFor = (d) => {
      switch (deviceSort.key) {
        case 'restaurant': return restaurantNameById.get(d.restaurant_id) || ''
        case 'status': return d.status
        case 'tag_id': return d.tag_id
        default: return d.created_at
      }
    }
    return [...rows].sort((a, b) => {
      const av = fieldFor(a)
      const bv = fieldFor(b)
      if (av < bv) return deviceSort.dir === 'asc' ? -1 : 1
      if (av > bv) return deviceSort.dir === 'asc' ? 1 : -1
      return 0
    })
  }, [devices, deviceSearch, deviceSort, restaurantNameById])

  const deviceTotalPages = Math.max(1, Math.ceil(sortedFilteredDevices.length / DEVICE_PAGE_SIZE))
  const pagedDevices = useMemo(
    () => sortedFilteredDevices.slice((devicePage - 1) * DEVICE_PAGE_SIZE, devicePage * DEVICE_PAGE_SIZE),
    [sortedFilteredDevices, devicePage]
  )

  useEffect(() => {
    setDevicePage(1)
  }, [deviceSearch, deviceSort])

  // Devices table is client-paginated, so a shrinking result set (search,
  // or a device getting deleted) can leave devicePage pointing past the
  // last page — clamp it back instead of showing an empty table.
  useEffect(() => {
    setDevicePage((p) => Math.min(p, deviceTotalPages))
  }, [deviceTotalPages])

  const globalResults = useMemo(() => {
    const query = globalSearch.trim().toLowerCase()
    if (!query) return []
    return [
      ...restaurants.filter((r) => `${r.name} ${r.city} ${r.country}`.toLowerCase().includes(query)).slice(0, 5).map((r) => ({ type: 'Restaurant', label: restaurantLabel(r), tab: 'restaurants', id: r.id })),
      ...globalUserMatches.slice(0, 5).map((u) => ({ type: 'User', label: `${u.display_name} — ${u.email}`, tab: 'users', id: u.id })),
      ...devices.filter((d) => (d.tag_id || '').toLowerCase().includes(query)).slice(0, 5).map((d) => ({ type: 'NFC Device', label: d.tag_id, tab: 'devices', id: d.id })),
    ].slice(0, 8)
  }, [globalSearch, restaurants, globalUserMatches, devices])

  const reassignMatch = useMemo(
    () => restaurants.find((r) => r.id === reassignRestaurantId),
    [restaurants, reassignRestaurantId]
  )

  const manualVerifyMatch = useMemo(
    () => restaurants.find((r) => r.id === manualVerifyForm.restaurant_id),
    [restaurants, manualVerifyForm.restaurant_id]
  )

  const restaurantTotalPages = Math.max(1, Math.ceil(restaurantTableTotal / RESTAURANT_PAGE_SIZE))
  const userTotalPages = Math.max(1, Math.ceil(usersTotal / USER_PAGE_SIZE))
  const auditTotalPages = Math.max(1, Math.ceil(auditLogsTotal / AUDIT_PAGE_SIZE))

  async function startEditRestaurant(item) {
    setEditingRestaurantId(item.id)
    const nextForm = { name: item.name, city: item.city, cuisine: item.cuisine, stars: item.stars, year_awarded: item.year_awarded, reservation_release_day: item.reservation_release_day || 0, price_tier: item.price_tier || 0, reservation_platform: item.reservation_platform || '', reservation_url: item.reservation_url || '', photo_url: item.photo_url || '' }
    restaurantFormInitialRef.current = JSON.stringify(nextForm)
    setRestaurantForm(nextForm)
    // The list view doesn't carry star_history/hours (kept out of that
    // payload on purpose) — fetch the full record just for the edit form.
    setStarHistoryForm([])
    setStarHistoryLoaded(false)
    setHoursForm(fillWeekHours([]))
    setHoursLoaded(false)
    editingRestaurantRequestRef.current = item.id
    try {
      const full = await api.restaurant(item.id)
      // A newer Edit click may have started (and possibly already
      // resolved) while this fetch was in flight — only apply it if it's
      // still the most recently requested restaurant.
      if (editingRestaurantRequestRef.current !== item.id) return
      setStarHistoryForm((full.star_history || []).slice().sort((a, b) => a.year - b.year).map((h) => ({ year: h.year, stars: h.stars })))
      setStarHistoryLoaded(true)
      setHoursForm(fillWeekHours(full.hours))
      setHoursLoaded(true)
    } catch (err) {
      if (editingRestaurantRequestRef.current !== item.id) return
      toast.push('error', `Could not load star history: ${err.message}`)
    }
  }

  function openGlobalResult(result) {
    setGlobalSearch('')
    setTab(result.tab)
    if (result.type === 'Restaurant') {
      const item = restaurants.find((r) => r.id === result.id)
      if (item) startEditRestaurant(item)
    } else if (result.type === 'User') {
      const user = globalUserMatches.find((u) => u.id === result.id)
      if (user) openUserHistory(user)
    } else if (result.type === 'NFC Device') {
      setDeviceRestaurantId(devices.find((d) => d.id === result.id)?.restaurant_id || null)
    }
  }

  function cancelEditRestaurant() {
    if (restaurantFormDirty && !window.confirm('You have unsaved changes. Leave without saving?')) return
    editingRestaurantRequestRef.current = null
    setEditingRestaurantId(null)
    setRestaurantForm(EMPTY_RESTAURANT_FORM)
    setStarHistoryForm([])
    setStarHistoryLoaded(false)
    setHoursForm([])
    setHoursLoaded(false)
  }

  async function submitRestaurant(e) {
    e.preventDefault()
    if (!restaurantForm.name.trim() || !restaurantForm.city.trim() || !restaurantForm.cuisine.trim()) {
      toast.push('error', 'Name, city, and cuisine are required')
      return
    }
    const duplicate = restaurants.find((r) => r.id !== editingRestaurantId && r.name.trim().toLowerCase() === restaurantForm.name.trim().toLowerCase() && r.city.trim().toLowerCase() === restaurantForm.city.trim().toLowerCase())
    if (duplicate) {
      toast.push('error', `A restaurant named ${duplicate.name} already exists in ${duplicate.city}`)
      return
    }
    if (restaurantForm.reservation_platform && !restaurantForm.reservation_url.trim()) {
      toast.push('error', 'Add a booking link, or set the platform back to None')
      return
    }
    await guard.run('restaurant-form', async () => {
      try {
        if (editingRestaurantId) {
          await api.updateRestaurant(editingRestaurantId, restaurantForm)
          // Only push history/hours if they actually loaded — never
          // overwrite real data with an empty set because the fetch failed.
          if (starHistoryLoaded) {
            await api.updateRestaurantStarHistory(editingRestaurantId, starHistoryForm)
          }
          if (hoursLoaded) {
            await api.updateRestaurantHours(editingRestaurantId, hoursForm)
          }
          toast.push('success', 'Restaurant updated')
        } else {
          await api.createRestaurant(restaurantForm)
          toast.push('success', 'Restaurant added')
        }
        cancelEditRestaurant()
        refreshRestaurantViews()
      } catch (err) {
        toast.push('error', err.message)
      }
    })
  }

  async function removeRestaurant(id) {
    if (!window.confirm('Delete this restaurant? This cannot be undone.')) return
    await guard.run(`restaurant-delete-${id}`, async () => {
      try {
        await api.deleteRestaurant(id)
        toast.push('success', 'Restaurant deleted')
        if (editingRestaurantId === id) cancelEditRestaurant()
        refreshRestaurantViews()
      } catch (err) {
        toast.push('error', err.message)
      }
    })
  }

  async function submitDevice(e) {
    e.preventDefault()
    if (!matchedRestaurant) {
      toast.push('error', 'Please select a restaurant first')
      return
    }
    await guard.run('device-form', async () => {
      try {
        await api.createNfcDevice({ tag_id: deviceForm.tag_id, restaurant_id: matchedRestaurant.id, salt: deviceForm.salt })
        toast.push('success', 'NFC device added')
        setDeviceRestaurantId(null)
        setNfcFilters({ year: '', city: '', cuisine: '' })
        setDeviceForm((f) => ({ ...f, salt: '' }))
        fetchDevices()
        fetchStats()
      } catch (err) {
        toast.push('error', err.message)
      }
    })
  }

  function startReassign(item) {
    setReassigningDeviceId(item.id)
    setReassignRestaurantId(item.restaurant_id)
  }

  async function saveReassign(item) {
    if (!reassignMatch) {
      toast.push('error', 'Pick a restaurant first')
      return
    }
    await guard.run(`device-reassign-${item.id}`, async () => {
      try {
        await api.updateNfcDevice(item.id, { restaurant_id: reassignMatch.id })
        toast.push('success', 'Device reassigned')
        setReassigningDeviceId(null)
        fetchDevices()
      } catch (err) {
        toast.push('error', err.message)
      }
    })
  }

  async function toggleDeviceStatus(item) {
    const next = item.status === 'disabled' ? 'active' : 'disabled'
    if (next === 'disabled' && !window.confirm('Disable this NFC device? Check-ins at this tag will stop verifying until re-enabled.')) return
    await guard.run(`device-status-${item.id}`, async () => {
      try {
        await api.updateNfcDeviceStatus(item.id, next)
        toast.push('success', next === 'disabled' ? 'Device disabled' : 'Device enabled')
        fetchDevices()
      } catch (err) {
        toast.push('error', err.message)
      }
    })
  }

  async function removeDevice(item) {
    if (!window.confirm('Delete this NFC device? This cannot be undone.')) return
    await guard.run(`device-delete-${item.id}`, async () => {
      try {
        await api.deleteNfcDevice(item.id)
        toast.push('success', 'Device deleted')
        fetchDevices()
      } catch (err) {
        toast.push('error', err.message)
      }
    })
  }

  function exportDevicesCsv() {
    if (!window.confirm('Exporting NFC devices includes every device\'s secret salt — the key material used to verify check-ins. Treat this file as sensitive and continue?')) return
    const header = ['tag_id', 'restaurant_id', 'restaurant_name', 'salt', 'status', 'created_at']
    const rows = devices.map((d) => {
      const r = restaurants.find((x) => x.id === d.restaurant_id)
      return [d.tag_id, d.restaurant_id, r ? r.name : '', d.salt, d.status, d.created_at]
    })
    downloadCsv(`nfc-devices-${new Date().toISOString().slice(0, 10)}.csv`, header, rows)
    toast.push('success', 'CSV exported')
  }

  async function handleAnomalyResolve(id, action) {
    await guard.run(`anomaly-${action}-${id}`, async () => {
      try {
        await api.resolveAnomaly(id, action)
        toast.push('success', action === 'dismiss' ? 'Anomaly dismissed' : 'Anomaly confirmed')
        fetchAnomalies()
        fetchStats()
      } catch (err) {
        toast.push('error', err.message)
      }
    })
  }

  async function handleRevokeCheckin(id) {
    if (!window.confirm('Revoke the checkin behind this anomaly and claw back its score?')) return
    await guard.run(`anomaly-revoke-${id}`, async () => {
      try {
        await api.revokeAnomalyCheckin(id)
        toast.push('success', 'Checkin revoked')
        fetchAnomalies()
        fetchStats()
      } catch (err) {
        toast.push('error', err.message)
      }
    })
  }

  async function handleDisableDevice(id) {
    if (!window.confirm('Disable the NFC device behind this anomaly?')) return
    await guard.run(`anomaly-disable-device-${id}`, async () => {
      try {
        await api.disableAnomalyDevice(id)
        toast.push('success', 'Device disabled')
        fetchAnomalies()
        fetchDevices()
      } catch (err) {
        toast.push('error', err.message)
      }
    })
  }

  async function handleBanUserFromAnomaly(id) {
    if (!window.confirm('Ban the user behind this anomaly? They will be unable to log in.')) return
    await guard.run(`anomaly-ban-user-${id}`, async () => {
      try {
        await api.banAnomalyUser(id)
        toast.push('success', 'User banned')
        fetchAnomalies()
      } catch (err) {
        toast.push('error', err.message)
      }
    })
  }

  async function openUserHistory(user) {
    setSelectedUserId(user.id)
    setSelectedUserHistory(null)
    try {
      const data = await api.userHistory(user.id)
      setSelectedUserHistory(data)
    } catch (err) {
      toast.push('error', err.message)
    }
  }

  async function bulkBanUsers() {
    const selected = users.filter((user) => selectedUserIds.has(user.id))
    const skippedAdmins = selected.filter((user) => user.role === 'admin')
    const targets = selected.filter((user) => user.role !== 'admin' && !user.banned)
    const ids = targets.map((user) => user.id)
    if (!ids.length) return
    if (!window.confirm(`Ban ${ids.length} selected user${ids.length === 1 ? '' : 's'}? Admin accounts and already banned users will be skipped.`)) return
    const results = await Promise.allSettled(ids.map((id) => api.banUser(id)))
    const failed = results.filter((result) => result.status === 'rejected').length
    try {
      setSelectedUserIds(new Set())
      const succeeded = ids.length - failed
      toast.push(failed ? 'error' : 'success', `${succeeded} banned, ${failed} failed${skippedAdmins.length ? `, ${skippedAdmins.length} admin skipped` : ''}`)
      fetchUsers()
    } catch (err) {
      toast.push('error', `Could not refresh users: ${err.message}`)
    }
  }

  async function handleBanToggle(user) {
    if (!user.banned && !window.confirm(`Ban ${user.display_name}? They will be unable to log in.`)) return
    await guard.run(`user-ban-${user.id}`, async () => {
      try {
        if (user.banned) await api.unbanUser(user.id)
        else await api.banUser(user.id)
        toast.push('success', user.banned ? 'User unbanned' : 'User banned')
        fetchUsers()
      } catch (err) {
        toast.push('error', err.message)
      }
    })
  }

  async function submitManualVerify(e) {
    e.preventDefault()
    if (!selectedUserId || !manualVerifyMatch) {
      toast.push('error', 'Pick a restaurant first')
      return
    }
    await guard.run('manual-verify-form', async () => {
      try {
        const data = await api.manualVerify({ user_id: selectedUserId, restaurant_id: manualVerifyMatch.id, note: manualVerifyForm.note })
        toast.push('success', data.new_badges?.length ? `Checkin added — ${data.new_badges.length} new badge(s) unlocked` : 'Checkin added')
        setManualVerifyForm({ restaurant_id: null, note: '' })
        openUserHistory({ id: selectedUserId })
        fetchStats()
      } catch (err) {
        toast.push('error', err.message)
      }
    })
  }

  function logout() {
    setToken(null)
    setCurrentAdmin(null)
  }

  if (!authChecked) {
    return null
  }

  if (!currentAdmin) {
    return <LoginPanel onAuthenticated={setCurrentAdmin} />
  }

  return (
    <div className="admin-shell">
      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
      <header className="admin-header">
        <div>
          <p className="label">StarTrack</p>
          <h1>Admin Management Portal</h1>
          <p className="subtitle">Rich metadata control for Michelin awards, NFC inventory, and anomaly review.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
          <div className="pill-list">
            <button className={tab === 'dashboard' ? 'pill active' : 'pill'} onClick={() => setTab('dashboard')}>
              Dashboard
            </button>
            <button className={tab === 'restaurants' ? 'pill active' : 'pill'} onClick={() => setTab('restaurants')}>
              Restaurant Engine
            </button>
            <button className={tab === 'devices' ? 'pill active' : 'pill'} onClick={() => setTab('devices')}>
              NFC Inventory
            </button>
            <button className={tab === 'security' ? 'pill active' : 'pill'} onClick={() => setTab('security')}>
              Security Dashboard
            </button>
            <button className={tab === 'reports' ? 'pill active' : 'pill'} onClick={() => setTab('reports')}>
              Review Reports
            </button>
            <button className={tab === 'users' ? 'pill active' : 'pill'} onClick={() => setTab('users')}>
              Users
            </button>
            <button className={tab === 'audit' ? 'pill active' : 'pill'} onClick={() => setTab('audit')}>
              Audit Log
            </button>
          </div>
          <button className="pill" onClick={logout}>{currentAdmin.display_name} · Log out</button>
        </div>
      </header>

      <div className="admin-global-search" style={{ position: 'relative', marginBottom: 20 }}>
        <input
          value={globalSearch}
          onChange={(e) => {
            const value = e.target.value
            setGlobalSearch(value)
            // Keep the user index behind global search in sync, while still
            // reusing the debounced Users query and its existing API.
            setUserSearch(value)
          }}
          placeholder="Search restaurants, users, or NFC tags..."
          aria-label="Global admin search"
        />
        {globalSearch.trim() && (
          <div className="admin-search-results" style={{ position: 'absolute', zIndex: 10, left: 0, right: 0, background: '#17181d', border: '1px solid #343640', borderRadius: 12, padding: 8 }}>
            {globalResults.length === 0 ? <p style={{ margin: 8, opacity: .65 }}>No matching records.</p> : globalResults.map((result, index) => (
              <button key={`${result.type}-${index}`} type="button" className="search-result" onClick={() => openGlobalResult(result)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', color: '#f3e6d0', border: 0, padding: '9px 10px', cursor: 'pointer' }}>
                <strong style={{ color: '#d2a14c', marginRight: 8 }}>{result.type}</strong>{result.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'dashboard' && (
        <section className="section-grid">
          <div className="panel-card">
            <div className="panel-header" style={{ marginBottom: 0 }}>
              <h2 style={{ marginBottom: 0 }}>Operations Dashboard</h2>
              <button type="button" className="pill" onClick={fetchStats} aria-label="Refresh dashboard statistics">🔄 Refresh Data</button>
            </div>
            <p>System-wide totals across check-ins, members, and fraud signals.</p>
          </div>
          {!stats && (
            <>
              <div className="stat-grid">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton-row" style={{ height: 78, borderRadius: 20 }} role="status" aria-label="Loading statistics" />
                ))}
              </div>
              <div className="chart-grid">
                <div className="skeleton-row" style={{ height: 240 }} role="status" aria-label="Loading chart" />
                <div className="skeleton-row" style={{ height: 240 }} role="status" aria-label="Loading chart" />
              </div>
            </>
          )}
          {stats && (
            <>
              <div className="stat-grid">
                <div className="stat-tile">
                  <span className="stat-label">Total Check-ins</span>
                  <span className="stat-value">{stats.total_checkins}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-label">Verified Check-ins</span>
                  <span className="stat-value">{stats.verified_checkins}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-label">Members</span>
                  <span className="stat-value">{stats.total_users}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-label">Active Members</span>
                  <span className="stat-value">{stats.active_users}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-label">Open Anomalies</span>
                  <span className="stat-value">{stats.open_anomalies}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-label">Anomaly Rate</span>
                  <span className="stat-value">{stats.anomaly_rate.toFixed(1)}%</span>
                </div>
              </div>
              <div className="chart-grid">
                <div className="admin-panel">
                  <div className="panel-header">
                    <h3>Check-in Trend (Last 7 Days)</h3>
                  </div>
                  <ErrorBoundary resetKey={JSON.stringify(stats.daily_trend)}>
                    <CheckinTrendChart data={stats.daily_trend || []} />
                  </ErrorBoundary>
                </div>
                <div className="admin-panel">
                  <div className="panel-header">
                    <h3>Verified Check-ins by City</h3>
                  </div>
                  <ErrorBoundary resetKey={JSON.stringify(stats.city_breakdown)}>
                    <CityBreakdownChart data={stats.city_breakdown || []} />
                  </ErrorBoundary>
                </div>
              </div>

              <div className="admin-panel wide-panel">
                <div className="panel-header">
                  <h3>Top 5 Restaurants by Verified Check-ins</h3>
                </div>
                <ErrorBoundary resetKey={JSON.stringify(stats.top_restaurants)}>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Restaurant</th>
                          <th>Verified Check-ins</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(stats.top_restaurants || []).length === 0 && (
                          <tr><td colSpan={2} style={{ opacity: 0.6 }}>No verified check-ins yet.</td></tr>
                        )}
                        {(stats.top_restaurants || []).map((r) => (
                          <tr key={r.id}>
                            <td>{r.name}</td>
                            <td>{r.verified_checkins}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ErrorBoundary>
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'dashboard' && stats && (
        <section className="admin-panel wide-panel" style={{ marginBottom: 20 }}>
          <div className="panel-header"><h3>Work Queue</h3><span className="field-hint">Next actions for the admin team</span></div>
          <div className="stat-grid">
            <button type="button" className="stat-tile" onClick={() => { setTab('security'); setAnomalyStatusFilter('open') }}><span className="stat-label">Open anomalies</span><span className="stat-value">{stats.open_anomalies || 0}</span><span className="field-hint">Review now →</span></button>
            <button type="button" className="stat-tile" onClick={() => setTab('reports')}><span className="stat-label">Pending reports</span><span className="stat-value">{reports.length}</span><span className="field-hint">Moderate now →</span></button>
            <button type="button" className="stat-tile" onClick={() => setTab('devices')}><span className="stat-label">Disabled devices</span><span className="stat-value">{devices.filter((d) => d.status === 'disabled').length}</span><span className="field-hint">Manage devices →</span></button>
          </div>
        </section>
      )}

      {tab === 'restaurants' && (
        <section className="section-grid">
          <div className="panel-card">
            <h2>Michelin Metadata Engine</h2>
            <p>Update star tiers, city metadata, and annual award changes with confidence.</p>
          </div>
          <div className="admin-panel">
            <div className="panel-header">
              <h3>Current Restaurants</h3>
            </div>
            <label style={{ marginBottom: 16, display: 'block' }}>
              Search
              <input
                value={restaurantSearch}
                onChange={(e) => { setRestaurantSearch(e.target.value); setRestaurantPage(1) }}
                placeholder="Search by restaurant name"
              />
            </label>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <SortableTh label="Name" sortKey="name" sort={restaurantSort} onSort={(key) => { setRestaurantSort((s) => toggleSort(s, key)); setRestaurantPage(1) }} />
                    <SortableTh label="Stars" sortKey="stars" sort={restaurantSort} onSort={(key) => { setRestaurantSort((s) => toggleSort(s, key)); setRestaurantPage(1) }} />
                    <SortableTh label="Price" sortKey="price_tier" sort={restaurantSort} onSort={(key) => { setRestaurantSort((s) => toggleSort(s, key)); setRestaurantPage(1) }} />
                    <th>Booking</th>
                    <SortableTh label="City" sortKey="city" sort={restaurantSort} onSort={(key) => { setRestaurantSort((s) => toggleSort(s, key)); setRestaurantPage(1) }} />
                    <SortableTh label="Cuisine" sortKey="cuisine" sort={restaurantSort} onSort={(key) => { setRestaurantSort((s) => toggleSort(s, key)); setRestaurantPage(1) }} />
                    <SortableTh label="Year" sortKey="year_awarded" sort={restaurantSort} onSort={(key) => { setRestaurantSort((s) => toggleSort(s, key)); setRestaurantPage(1) }} />
                    <th>Next Release</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {restaurantTableRows.length === 0 && (
                    <tr><td colSpan={10} style={{ opacity: 0.6 }}>No restaurants found.</td></tr>
                  )}
                  {restaurantTableRows.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.name}</td>
                      <td>{item.stars}</td>
                      <td>{item.price_tier ? '💰'.repeat(item.price_tier) : '—'}</td>
                      <td>{item.reservation_platform ? RESERVATION_PLATFORMS.find((p) => p.value === item.reservation_platform)?.label : '—'}</td>
                      <td>{item.city}</td>
                      <td>{item.cuisine}</td>
                      <td>{item.year_awarded}</td>
                      <td>{item.next_reservation_release ? new Date(item.next_reservation_release).toLocaleDateString() : '—'}</td>
                      <td>
                        <div className="table-actions">
                          <button type="button" className="icon-btn" onClick={() => startEditRestaurant(item)}>Edit</button>
                          <button
                            type="button"
                            className="icon-btn"
                            disabled={guard.isPending(`restaurant-delete-${item.id}`)}
                            onClick={() => removeRestaurant(item.id)}
                          >
                            {guard.isPending(`restaurant-delete-${item.id}`) ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination-row">
              <span>{restaurantTableTotal} restaurant{restaurantTableTotal === 1 ? '' : 's'}</span>
              <div className="pagination-buttons">
                <button type="button" className="icon-btn" disabled={restaurantPage <= 1} onClick={() => setRestaurantPage((p) => p - 1)}>Prev</button>
                <span>Page {restaurantPage} / {restaurantTotalPages}</span>
                <button type="button" className="icon-btn" disabled={restaurantPage >= restaurantTotalPages} onClick={() => setRestaurantPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          </div>
          <div className="form-card">
            <h3>{editingRestaurantId ? 'Edit Restaurant' : 'Add Restaurant'}</h3>
            <form onSubmit={submitRestaurant} className="admin-form">
              <label>
                Name
                <input value={restaurantForm.name} onChange={(e) => setRestaurantForm({ ...restaurantForm, name: e.target.value })} />
              </label>
              <TypeaheadInput
                id="restaurant-city-options"
                label="City"
                value={restaurantForm.city}
                onChange={(v) => setRestaurantForm({ ...restaurantForm, city: v })}
                options={cities.map((c) => c.name)}
                placeholder="Type or select a city"
                addLabel="Add city"
                onAddOption={async (name) => {
                  const created = await api.createCity({ name })
                  setCities((prev) => (prev.some((c) => c.name === created.name) ? prev : [...prev, created].sort((a, b) => a.name.localeCompare(b.name))))
                }}
              />
              <TypeaheadInput
                id="restaurant-cuisine-options"
                label="Cuisine"
                value={restaurantForm.cuisine}
                onChange={(v) => setRestaurantForm({ ...restaurantForm, cuisine: v })}
                options={cuisines.map((c) => c.name)}
                placeholder="Type or select a cuisine"
                addLabel="Add cuisine"
                onAddOption={async (name) => {
                  const created = await api.createCuisine({ name })
                  setCuisines((prev) => (prev.some((c) => c.name === created.name) ? prev : [...prev, created].sort((a, b) => a.name.localeCompare(b.name))))
                }}
              />
              <label>
                Stars
                <input
                  type="number"
                  min="1"
                  max="3"
                  step="1"
                  value={restaurantForm.stars}
                  onChange={(e) => setRestaurantForm({ ...restaurantForm, stars: clampStars(Number(e.target.value)) })}
                />
              </label>
              <label>
                Year Awarded
                <input type="number" value={restaurantForm.year_awarded} onChange={(e) => setRestaurantForm({ ...restaurantForm, year_awarded: Number(e.target.value) })} />
              </label>
              <label>
                Price Tier
                <input
                  type="number"
                  min="0"
                  max="3"
                  step="1"
                  placeholder="0 = unknown"
                  value={restaurantForm.price_tier}
                  onChange={(e) => setRestaurantForm({ ...restaurantForm, price_tier: clampPriceTier(Number(e.target.value)) })}
                />
                <span className="field-hint">1-3 money-sign tier (💰/💰💰/💰💰💰). Leave 0 if unknown.</span>
              </label>
              <label>
                Photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (!file) return
                    guard.run('restaurant-photo-upload', async () => {
                      try {
                        const { photo_url } = await api.uploadRestaurantPhoto(file)
                        setRestaurantForm((prev) => ({ ...prev, photo_url }))
                      } catch (err) {
                        toast.push('error', err.message)
                      }
                    })
                  }}
                />
                {guard.isPending('restaurant-photo-upload') && <span className="field-hint">Uploading…</span>}
                {restaurantForm.photo_url && (
                  <img src={restaurantForm.photo_url} alt="" style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 6, marginTop: 6 }} />
                )}
                <input
                  type="url"
                  placeholder="Or paste a photo URL directly"
                  value={restaurantForm.photo_url}
                  onChange={(e) => setRestaurantForm({ ...restaurantForm, photo_url: e.target.value })}
                  style={{ marginTop: 6 }}
                />
              </label>
              <label>
                Reservation Release Day
                <input
                  type="number"
                  min="0"
                  max="31"
                  step="1"
                  placeholder="0 = no recurring schedule"
                  value={restaurantForm.reservation_release_day}
                  onChange={(e) => setRestaurantForm({ ...restaurantForm, reservation_release_day: Number(e.target.value) })}
                />
                <span className="field-hint">Day of month reservations open, e.g. 1. Leave 0 if there's no recurring schedule.</span>
              </label>
              <label>
                Online Booking Platform
                <select
                  value={restaurantForm.reservation_platform}
                  onChange={(e) => {
                    const reservation_platform = e.target.value
                    setRestaurantForm((prev) => ({
                      ...prev,
                      reservation_platform,
                      reservation_url: reservation_platform ? prev.reservation_url : '',
                    }))
                  }}
                >
                  {RESERVATION_PLATFORMS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              {restaurantForm.reservation_platform && (
                <label>
                  Booking Link
                  <input
                    type="url"
                    placeholder="https://www.opentable.com/r/..."
                    value={restaurantForm.reservation_url}
                    onChange={(e) => setRestaurantForm({ ...restaurantForm, reservation_url: e.target.value })}
                  />
                  <span className="field-hint">StarTrack doesn't take bookings itself — this just links guests out to the real platform.</span>
                </label>
              )}
              {editingRestaurantId && (
                <div className="star-history-editor">
                  <span className="field-hint" style={{ display: 'block', marginBottom: 6 }}>
                    Star History — the tier this restaurant held in each past guide year
                  </span>
                  {starHistoryForm.map((entry, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                      <input
                        type="number"
                        placeholder="Year"
                        value={entry.year}
                        style={{ width: 90 }}
                        onChange={(e) => {
                          const year = Number(e.target.value)
                          setStarHistoryForm((prev) => prev.map((row, idx) => (idx === i ? { ...row, year } : row)))
                        }}
                      />
                      <input
                        type="number"
                        min="1"
                        max="3"
                        placeholder="Stars"
                        value={entry.stars}
                        style={{ width: 70 }}
                        onChange={(e) => {
                          const stars = clampStars(Number(e.target.value))
                          setStarHistoryForm((prev) => prev.map((row, idx) => (idx === i ? { ...row, stars } : row)))
                        }}
                      />
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setStarHistoryForm((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setStarHistoryForm((prev) => [...prev, { year: restaurantForm.year_awarded, stars: restaurantForm.stars }])}
                  >
                    + Add Year
                  </button>
                </div>
              )}
              {editingRestaurantId && (
                <div className="hours-editor">
                  <span className="field-hint" style={{ display: 'block', marginBottom: 6 }}>
                    Opening Hours — set per day; check Closed for a day with no hours
                  </span>
                  {hoursForm.map((entry, i) => (
                    <div key={entry.day_of_week} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                      <span style={{ width: 90 }}>{WEEKDAY_LABELS[entry.day_of_week]}</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="checkbox"
                          checked={entry.is_closed}
                          onChange={(e) => {
                            const is_closed = e.target.checked
                            setHoursForm((prev) => prev.map((row, idx) => (idx === i ? { ...row, is_closed } : row)))
                          }}
                        />
                        Closed
                      </label>
                      <input
                        type="time"
                        value={entry.open_time}
                        disabled={entry.is_closed}
                        onChange={(e) => {
                          const open_time = e.target.value
                          setHoursForm((prev) => prev.map((row, idx) => (idx === i ? { ...row, open_time } : row)))
                        }}
                      />
                      <span>–</span>
                      <input
                        type="time"
                        value={entry.close_time}
                        disabled={entry.is_closed}
                        onChange={(e) => {
                          const close_time = e.target.value
                          setHoursForm((prev) => prev.map((row, idx) => (idx === i ? { ...row, close_time } : row)))
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
              <button type="submit" disabled={guard.isPending('restaurant-form')}>
                {guard.isPending('restaurant-form') ? 'Saving…' : editingRestaurantId ? 'Save Changes' : 'Save Restaurant'}
              </button>
              {editingRestaurantId && (
                <button type="button" className="icon-btn" onClick={cancelEditRestaurant}>Cancel</button>
              )}
            </form>
          </div>
        </section>
      )}

      {tab === 'devices' && (
        <section className="section-grid">
          <div className="panel-card">
            <h2>NFC Hardware Inventory</h2>
            <p>Provision tags, attach salts, and map every hardware token to the right restaurant.</p>
          </div>
          <div className="admin-panel">
            <div className="panel-header">
              <h3>Registered NFC Devices</h3>
              <div className="table-actions">
                <button
                  type="button"
                  className="pill"
                  onClick={() => setRevealSalts((v) => !v)}
                  aria-label={revealSalts ? 'Hide device salts' : 'Reveal device salts'}
                >
                  {revealSalts ? '🙈 Hide Salts' : '👁 Reveal Salts'}
                </button>
                <button type="button" className="pill" onClick={exportDevicesCsv} aria-label="Export NFC devices to CSV">
                  Export CSV
                </button>
              </div>
            </div>
            <label style={{ marginBottom: 16, display: 'block' }}>
              Search
              <input
                value={deviceSearch}
                onChange={(e) => setDeviceSearch(e.target.value)}
                placeholder="Search by tag ID, restaurant, or status"
              />
            </label>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <SortableTh label="Tag ID" sortKey="tag_id" sort={deviceSort} onSort={(key) => setDeviceSort((s) => toggleSort(s, key))} />
                    <SortableTh label="Restaurant" sortKey="restaurant" sort={deviceSort} onSort={(key) => setDeviceSort((s) => toggleSort(s, key))} />
                    <th>Salt</th>
                    <SortableTh label="Status" sortKey="status" sort={deviceSort} onSort={(key) => setDeviceSort((s) => toggleSort(s, key))} />
                    <SortableTh label="Created" sortKey="created_at" sort={deviceSort} onSort={(key) => setDeviceSort((s) => toggleSort(s, key))} />
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedDevices.length === 0 && (
                    <tr><td colSpan={6} style={{ opacity: 0.6 }}>No devices found.</td></tr>
                  )}
                  {pagedDevices.map((item) => {
                    const restaurant = restaurants.find((r) => r.id === item.restaurant_id)
                    const isReassigning = reassigningDeviceId === item.id
                    return (
                      <tr key={item.id}>
                        <td>{item.tag_id}</td>
                        <td>
                          {isReassigning ? (
                            <select
                              value={reassignRestaurantId ?? ''}
                              onChange={(e) => setReassignRestaurantId(e.target.value ? Number(e.target.value) : null)}
                              aria-label={`Reassign ${item.tag_id} to restaurant`}
                            >
                              <option value="">Select a restaurant</option>
                              {restaurants.map((r) => (
                                <option key={r.id} value={r.id}>{restaurantLabel(r)}</option>
                              ))}
                            </select>
                          ) : (
                            restaurant ? `${restaurant.name} (#${item.restaurant_id})` : `#${item.restaurant_id}`
                          )}
                        </td>
                        <td>
                          <code>{revealSalts ? item.salt : maskSalt(item.salt)}</code>
                        </td>
                        <td><StatusBadge active={item.status !== 'disabled'} activeLabel="Active" inactiveLabel="Disabled" /></td>
                        <td>{new Date(item.created_at).toLocaleDateString()}</td>
                        <td>
                          <div className="table-actions">
                            {isReassigning ? (
                              <>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  disabled={guard.isPending(`device-reassign-${item.id}`)}
                                  onClick={() => saveReassign(item)}
                                >
                                  {guard.isPending(`device-reassign-${item.id}`) ? 'Saving…' : 'Save'}
                                </button>
                                <button type="button" className="icon-btn" onClick={() => setReassigningDeviceId(null)}>Cancel</button>
                              </>
                            ) : (
                              <>
                                <button type="button" className="icon-btn" onClick={() => startReassign(item)}>Reassign</button>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  disabled={guard.isPending(`device-status-${item.id}`)}
                                  onClick={() => toggleDeviceStatus(item)}
                                >
                                  {guard.isPending(`device-status-${item.id}`) ? '…' : item.status === 'disabled' ? 'Enable' : 'Disable'}
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  disabled={guard.isPending(`device-delete-${item.id}`)}
                                  onClick={() => removeDevice(item)}
                                >
                                  {guard.isPending(`device-delete-${item.id}`) ? 'Deleting…' : 'Delete'}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="pagination-row">
              <span>{sortedFilteredDevices.length} device{sortedFilteredDevices.length === 1 ? '' : 's'}</span>
              <div className="pagination-buttons">
                <button type="button" className="icon-btn" disabled={devicePage <= 1} onClick={() => setDevicePage((p) => p - 1)}>Prev</button>
                <span>Page {devicePage} / {deviceTotalPages}</span>
                <button type="button" className="icon-btn" disabled={devicePage >= deviceTotalPages} onClick={() => setDevicePage((p) => p + 1)}>Next</button>
              </div>
            </div>
          </div>
          <div className="form-card">
            <h3>Provision NFC Tag</h3>
            <form onSubmit={submitDevice} className="admin-form">
              <label>
                Tag ID
                <input value={deviceForm.tag_id} readOnly />
              </label>
              <span className="field-hint">Auto-generated serial, increments from the existing tag count — not editable</span>

              <div className="filter-row">
                <TypeaheadInput
                  id="nfc-year-options"
                  label="Year"
                  value={nfcFilters.year}
                  onChange={(v) => setNfcFilters({ ...nfcFilters, year: v })}
                  options={restaurantYears}
                  placeholder="All years"
                />
                <TypeaheadInput
                  id="nfc-city-options"
                  label="City"
                  value={nfcFilters.city}
                  onChange={(v) => setNfcFilters({ ...nfcFilters, city: v })}
                  options={cities.map((c) => c.name)}
                  placeholder="All cities"
                />
                <TypeaheadInput
                  id="nfc-cuisine-options"
                  label="Cuisine"
                  value={nfcFilters.cuisine}
                  onChange={(v) => setNfcFilters({ ...nfcFilters, cuisine: v })}
                  options={cuisines.map((c) => c.name)}
                  placeholder="All cuisines"
                />
              </div>

              <RestaurantSelect
                label="Restaurant"
                value={deviceRestaurantId}
                onChange={setDeviceRestaurantId}
                restaurants={filteredRestaurants}
                placeholder="Select a restaurant"
              />
              {matchedRestaurant && (
                <span className="field-hint">Selected: {matchedRestaurant.name} (#{matchedRestaurant.id})</span>
              )}

              <label>
                Salt
                <div className="combo-row">
                  <input value={deviceForm.salt} readOnly />
                  <button type="button" className="icon-btn" onClick={() => setDeviceForm((f) => ({ ...f, salt: generateSalt() }))}>
                    Regenerate
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => {
                      navigator.clipboard.writeText(deviceForm.salt)
                        .then(() => toast.push('success', 'Salt copied to clipboard'))
                        .catch((err) => toast.push('error', `Could not copy salt: ${err.message}`))
                    }}
                    aria-label="Copy salt to clipboard"
                  >
                    📋 Copy
                  </button>
                </div>
              </label>
              <span className="field-hint">Auto-generated random salt — regenerate and copy it if you need it to match a physical tag</span>

              <button type="submit" disabled={!matchedRestaurant || guard.isPending('device-form')}>
                {guard.isPending('device-form') ? 'Saving…' : 'Save Device'}
              </button>
            </form>
          </div>
        </section>
      )}

      {tab === 'security' && (
        <section className="section-grid">
          <div className="panel-card">
            <h2>Moderation & Security</h2>
            <p>Review the highest-risk check-in anomalies, suspicious velocity patterns, and audit history.</p>
          </div>
          <div className="admin-panel wide-panel">
            <div className="panel-header">
              <h3>Flagged Anomalies</h3>
              <button type="button" className="pill" onClick={fetchAnomalies} aria-label="Refresh anomalies">🔄 Refresh</button>
            </div>
            <div className="pill-list" style={{ marginBottom: 20 }}>
              {[{ key: 'open', label: 'Open' }, { key: 'dismissed', label: 'Dismissed' }, { key: 'confirmed', label: 'Confirmed' }, { key: '', label: 'All' }].map((opt) => (
                <button
                  key={opt.key || 'all'}
                  className={anomalyStatusFilter === opt.key ? 'pill active' : 'pill'}
                  onClick={() => setAnomalyStatusFilter(opt.key)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="anomalies-list">
              {anomalies.length === 0 && <p style={{ opacity: 0.6, fontSize: 13 }}>No anomalies in this view.</p>}
              {anomalies.map((item) => (
                <div key={item.id} className="anomaly-card">
                  <div className="anomaly-header">
                    <strong>{item.severity.toUpperCase()}</strong>
                    <span className={`status-badge status-${item.status}`}>{item.status}</span>
                  </div>
                  <p>{item.description}</p>
                  <div className="anomaly-details" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, margin: '12px 0', fontSize: 12, opacity: .8 }}>
                    <span>User: #{item.user_id || '—'}</span>
                    <span>Restaurant: #{item.restaurant_id || '—'}</span>
                    <span>Check-in: #{item.checkin_id || '—'}</span>
                    <span>Device: #{item.device_id || '—'}</span>
                    <span>Created: {item.created_at ? new Date(item.created_at).toLocaleString() : '—'}</span>
                  </div>
                  {item.status === 'open' && (
                    <div className="table-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={guard.isPending(`anomaly-dismiss-${item.id}`)}
                        onClick={() => handleAnomalyResolve(item.id, 'dismiss')}
                      >
                        {guard.isPending(`anomaly-dismiss-${item.id}`) ? '…' : 'Dismiss'}
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={guard.isPending(`anomaly-confirm-${item.id}`)}
                        onClick={() => handleAnomalyResolve(item.id, 'confirm')}
                      >
                        {guard.isPending(`anomaly-confirm-${item.id}`) ? '…' : 'Confirm'}
                      </button>
                      {item.checkin_id && (
                        <button
                          type="button"
                          className="icon-btn"
                          disabled={guard.isPending(`anomaly-revoke-${item.id}`)}
                          onClick={() => handleRevokeCheckin(item.id)}
                        >
                          {guard.isPending(`anomaly-revoke-${item.id}`) ? 'Revoking…' : 'Revoke Check-in'}
                        </button>
                      )}
                      {item.device_id && (
                        <button
                          type="button"
                          className="icon-btn"
                          disabled={guard.isPending(`anomaly-disable-device-${item.id}`)}
                          onClick={() => handleDisableDevice(item.id)}
                        >
                          {guard.isPending(`anomaly-disable-device-${item.id}`) ? 'Disabling…' : 'Disable Device'}
                        </button>
                      )}
                      {item.user_id && (
                        <button
                          type="button"
                          className="icon-btn"
                          disabled={guard.isPending(`anomaly-ban-user-${item.id}`)}
                          onClick={() => handleBanUserFromAnomaly(item.id)}
                        >
                          {guard.isPending(`anomaly-ban-user-${item.id}`) ? 'Banning…' : 'Ban User'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {tab === 'reports' && (
        <section className="section-grid">
          <div className="panel-card">
            <h2>Review Reports</h2>
            <p>Moderation queue for user-submitted complaints about reviews that may be spam, abusive, or otherwise inappropriate.</p>
          </div>
          <div className="admin-panel wide-panel">
            <div className="panel-header">
              <h3>Open Report Queue</h3>
              <button type="button" className="pill" onClick={fetchReports} aria-label="Refresh reports">🔄 Refresh</button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Review</th>
                    <th>Reporter</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Details</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.length === 0 && (
                    <tr><td colSpan={8} style={{ opacity: 0.6 }}>No review reports queued.</td></tr>
                  )}
                  {reports.map((report) => (
                    <tr key={report.id}>
                      <td>#{report.id}</td>
                      <td>Review #{report.review_id}</td>
                      <td>User #{report.user_id}</td>
                      <td>{report.reason}</td>
                      <td><StatusBadge active={report.status === 'open'} activeLabel="Open" inactiveLabel={report.status || 'Closed'} /></td>
                      <td>{new Date(report.created_at).toLocaleString()}</td>
                      <td>{report.details || '—'}</td>
                      <td>
                        {report.status === 'open' && (
                          <div className="table-actions">
                            <button type="button" className="icon-btn" disabled={guard.isPending(`report-dismiss-${report.id}`)} onClick={() => handleReportAction(report.id, 'dismiss')} title="Dismiss this report as false positive">{guard.isPending(`report-dismiss-${report.id}`) ? '…' : 'Dismiss'}</button>
                            <button type="button" className="icon-btn" disabled={guard.isPending(`report-delete_review-${report.id}`)} onClick={() => { if (window.confirm('Delete the flagged review? This cannot be undone.')) { handleReportAction(report.id, 'delete_review') } }} title="Delete the flagged review and mark report resolved">{guard.isPending(`report-delete_review-${report.id}`) ? 'Deleting…' : 'Delete Review'}</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {tab === 'users' && (
        <section className="section-grid">
          <div className="panel-card">
            <h2>User Management</h2>
            <p>Search members, review their check-in history, and manually back-fill a verified visit when a physical NFC tap fails.</p>
          </div>
          <div className="admin-panel wide-panel">
            <div className="panel-header">
              <h3>Members</h3>
            </div>
            <label style={{ marginBottom: 16, display: 'block' }}>
              Search
              <input value={userSearch} onChange={(e) => { setUserSearch(e.target.value); setUserPage(1) }} placeholder="Search by email or name" />
            </label>
            {selectedUserIds.size > 0 && (
              <div className="panel-header" style={{ marginBottom: 12 }}>
                <span>{selectedUserIds.size} selected on this page</span>
                <button type="button" className="icon-btn" onClick={bulkBanUsers}>Ban Selected Users</button>
              </div>
            )}
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th><input type="checkbox" aria-label="Select all visible users" checked={users.length > 0 && users.every((u) => selectedUserIds.has(u.id))} onChange={(e) => setSelectedUserIds((prev) => { const next = new Set(prev); users.forEach((u) => e.target.checked ? next.add(u.id) : next.delete(u.id)); return next })} /></th>
                    <th>ID</th>
                    <SortableTh label="Name" sortKey="display_name" sort={userSort} onSort={(key) => { setUserSort((s) => toggleSort(s, key)); setUserPage(1) }} />
                    <SortableTh label="Email" sortKey="email" sort={userSort} onSort={(key) => { setUserSort((s) => toggleSort(s, key)); setUserPage(1) }} />
                    <th>Role</th>
                    <SortableTh label="Region" sortKey="region" sort={userSort} onSort={(key) => { setUserSort((s) => toggleSort(s, key)); setUserPage(1) }} />
                    <SortableTh label="Score" sortKey="score" sort={userSort} onSort={(key) => { setUserSort((s) => toggleSort(s, key)); setUserPage(1) }} />
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && <tr><td colSpan={9} style={{ opacity: 0.6 }}>No users found.</td></tr>}
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td><input type="checkbox" aria-label={`Select ${u.display_name}`} checked={selectedUserIds.has(u.id)} onChange={(e) => setSelectedUserIds((prev) => { const next = new Set(prev); e.target.checked ? next.add(u.id) : next.delete(u.id); return next })} /></td>
                      <td>{u.id}</td>
                      <td>{u.display_name}</td>
                      <td>{u.email}</td>
                      <td>{u.role}</td>
                      <td>{u.region}</td>
                      <td>{u.score}</td>
                      <td><StatusBadge active={!u.banned} activeLabel="Active" inactiveLabel="Banned" /></td>
                      <td>
                        <div className="table-actions">
                          <button type="button" className="icon-btn" onClick={() => openUserHistory(u)}>History</button>
                          <button
                            type="button"
                            className="icon-btn"
                            disabled={guard.isPending(`user-ban-${u.id}`)}
                            onClick={() => handleBanToggle(u)}
                          >
                            {guard.isPending(`user-ban-${u.id}`) ? '…' : u.banned ? 'Unban' : 'Ban'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination-row">
              <span>{usersTotal} user{usersTotal === 1 ? '' : 's'}</span>
              <div className="pagination-buttons">
                <button type="button" className="icon-btn" disabled={userPage <= 1} onClick={() => setUserPage((p) => p - 1)}>Prev</button>
                <span>Page {userPage} / {userTotalPages}</span>
                <button type="button" className="icon-btn" disabled={userPage >= userTotalPages} onClick={() => setUserPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          </div>

          {selectedUserId && (
            <div className="admin-panel wide-panel">
              <div className="panel-header">
                <h3>Check-in History{selectedUserHistory ? ` — ${selectedUserHistory.user.display_name}` : ''}</h3>
              </div>
              {!selectedUserHistory && <SkeletonStack count={4} height={44} />}
              {selectedUserHistory && (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Restaurant</th>
                        <th>Verified</th>
                        <th>Revoked</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedUserHistory.checkins || []).length === 0 && (
                        <tr><td colSpan={4} style={{ opacity: 0.6 }}>No check-ins yet.</td></tr>
                      )}
                      {(selectedUserHistory.checkins || []).map((ci) => (
                        <tr key={ci.id}>
                          <td>{ci.restaurant?.name || `#${ci.restaurant_id}`}</td>
                          <td>{ci.verified ? 'Yes' : 'No'}</td>
                          <td>{ci.revoked ? 'Yes' : 'No'}</td>
                          <td>{new Date(ci.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="form-card" style={{ marginTop: 20 }}>
                <h3>Manual Check-in Override</h3>
                <p style={{ fontSize: 13, opacity: 0.75, marginTop: -8 }}>
                  Use when a customer's physical NFC tap failed but they have other proof of dining (e.g. a receipt).
                </p>
                <form onSubmit={submitManualVerify} className="admin-form">
                  <RestaurantSelect
                    label="Restaurant"
                    value={manualVerifyForm.restaurant_id}
                    onChange={(id) => setManualVerifyForm({ ...manualVerifyForm, restaurant_id: id })}
                    restaurants={restaurants}
                    placeholder="Select a restaurant"
                  />
                  <label>
                    Note (optional)
                    <input
                      value={manualVerifyForm.note}
                      onChange={(e) => setManualVerifyForm({ ...manualVerifyForm, note: e.target.value })}
                      placeholder="e.g. receipt #1234 confirmed by support"
                    />
                  </label>
                  <button type="submit" disabled={!manualVerifyMatch || guard.isPending('manual-verify-form')}>
                    {guard.isPending('manual-verify-form') ? 'Saving…' : 'Add Verified Check-in'}
                  </button>
                </form>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'audit' && (
        <section className="section-grid">
          <div className="panel-card">
            <h2>Audit Log</h2>
            <p>Every sensitive admin action — deletes, bans, manual overrides, device status changes, anomaly resolutions — with who did it, when, and from where.</p>
          </div>
          <div className="admin-panel wide-panel">
            <div className="panel-header">
              <h3>Recent Activity</h3>
              <button type="button" className="pill" onClick={fetchAuditLogs} aria-label="Refresh audit log">🔄 Refresh</button>
            </div>
            <label style={{ marginBottom: 16, display: 'block' }}>
              Search
              <input
                value={auditSearch}
                onChange={(e) => { setAuditSearch(e.target.value); setAuditPage(1) }}
                placeholder="Search by admin, action, target type, or detail"
              />
            </label>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <SortableTh label="Time" sortKey="created_at" sort={auditSort} onSort={(key) => { setAuditSort((s) => toggleSort(s, key)); setAuditPage(1) }} />
                    <SortableTh label="Admin" sortKey="admin_email" sort={auditSort} onSort={(key) => { setAuditSort((s) => toggleSort(s, key)); setAuditPage(1) }} />
                    <SortableTh label="Action" sortKey="action" sort={auditSort} onSort={(key) => { setAuditSort((s) => toggleSort(s, key)); setAuditPage(1) }} />
                    <SortableTh label="Target" sortKey="target_type" sort={auditSort} onSort={(key) => { setAuditSort((s) => toggleSort(s, key)); setAuditPage(1) }} />
                    <th>Detail</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length === 0 && (
                    <tr><td colSpan={6} style={{ opacity: 0.6 }}>No admin actions recorded yet.</td></tr>
                  )}
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.created_at).toLocaleString()}</td>
                      <td>{log.admin_email || `#${log.admin_id}`}</td>
                      <td>{log.action}</td>
                      <td>{log.target_type ? `${log.target_type}${log.target_id ? ` #${log.target_id}` : ''}` : '—'}</td>
                      <td>{log.detail || '—'}</td>
                      <td>{log.ip_address}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination-row">
              <span>{auditLogsTotal} event{auditLogsTotal === 1 ? '' : 's'}</span>
              <div className="pagination-buttons">
                <button type="button" className="icon-btn" disabled={auditPage <= 1} onClick={() => setAuditPage((p) => p - 1)}>Prev</button>
                <span>Page {auditPage} / {auditTotalPages}</span>
                <button type="button" className="icon-btn" disabled={auditPage >= auditTotalPages} onClick={() => setAuditPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
