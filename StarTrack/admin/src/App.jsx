import { useEffect, useMemo, useState } from 'react'
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
const EMPTY_RESTAURANT_FORM = { name: '', city: '', cuisine: '', stars: 1, year_awarded: 2026 }

function clampStars(value) {
  return Math.min(3, Math.max(1, Math.round(value) || 1))
}

export default function App() {
  const [currentAdmin, setCurrentAdmin] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const toast = useToasts()
  const guard = useActionGuard()

  const [tab, setTab] = useState('dashboard')

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

  // Restaurant Engine's own paginated/searchable table view
  const [restaurantTableRows, setRestaurantTableRows] = useState([])
  const [restaurantTableTotal, setRestaurantTableTotal] = useState(0)
  const [restaurantSearch, setRestaurantSearch] = useState('')
  const [restaurantPage, setRestaurantPage] = useState(1)
  const [editingRestaurantId, setEditingRestaurantId] = useState(null)
  const [restaurantForm, setRestaurantForm] = useState(EMPTY_RESTAURANT_FORM)

  const [deviceForm, setDeviceForm] = useState({ tag_id: '', salt: '' })
  const [nfcFilters, setNfcFilters] = useState({ year: '', city: '', cuisine: '' })
  const [deviceRestaurantId, setDeviceRestaurantId] = useState(null)
  const [revealSalts, setRevealSalts] = useState(false)
  const [reassigningDeviceId, setReassigningDeviceId] = useState(null)
  const [reassignRestaurantId, setReassignRestaurantId] = useState(null)

  const [userSearch, setUserSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [selectedUserHistory, setSelectedUserHistory] = useState(null)
  const [manualVerifyForm, setManualVerifyForm] = useState({ restaurant_id: null, note: '' })

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
    fetchAuditLogs()
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
  }, [currentAdmin, restaurantSearch, restaurantPage])

  useEffect(() => {
    if (!currentAdmin) return
    const t = setTimeout(() => fetchUsers(), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAdmin, userSearch])

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
      const params = { limit: RESTAURANT_PAGE_SIZE, page: restaurantPage }
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
      const data = await api.users(userSearch)
      setUsers(data.users || [])
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
      const data = await api.auditLogs()
      setAuditLogs(data.audit_logs || [])
    } catch (err) {
      toast.push('error', `Failed to load audit log: ${err.message}`)
    }
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

  const reassignMatch = useMemo(
    () => restaurants.find((r) => r.id === reassignRestaurantId),
    [restaurants, reassignRestaurantId]
  )

  const manualVerifyMatch = useMemo(
    () => restaurants.find((r) => r.id === manualVerifyForm.restaurant_id),
    [restaurants, manualVerifyForm.restaurant_id]
  )

  const restaurantTotalPages = Math.max(1, Math.ceil(restaurantTableTotal / RESTAURANT_PAGE_SIZE))

  function startEditRestaurant(item) {
    setEditingRestaurantId(item.id)
    setRestaurantForm({ name: item.name, city: item.city, cuisine: item.cuisine, stars: item.stars, year_awarded: item.year_awarded })
  }

  function cancelEditRestaurant() {
    setEditingRestaurantId(null)
    setRestaurantForm(EMPTY_RESTAURANT_FORM)
  }

  async function submitRestaurant(e) {
    e.preventDefault()
    await guard.run('restaurant-form', async () => {
      try {
        if (editingRestaurantId) {
          await api.updateRestaurant(editingRestaurantId, restaurantForm)
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
                    <CheckinTrendChart data={stats.daily_trend} />
                  </ErrorBoundary>
                </div>
                <div className="admin-panel">
                  <div className="panel-header">
                    <h3>Verified Check-ins by City</h3>
                  </div>
                  <ErrorBoundary resetKey={JSON.stringify(stats.city_breakdown)}>
                    <CityBreakdownChart data={stats.city_breakdown} />
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
                        {stats.top_restaurants.length === 0 && (
                          <tr><td colSpan={2} style={{ opacity: 0.6 }}>No verified check-ins yet.</td></tr>
                        )}
                        {stats.top_restaurants.map((r) => (
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
                    <th>Name</th>
                    <th>Stars</th>
                    <th>City</th>
                    <th>Cuisine</th>
                    <th>Year</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {restaurantTableRows.length === 0 && (
                    <tr><td colSpan={6} style={{ opacity: 0.6 }}>No restaurants found.</td></tr>
                  )}
                  {restaurantTableRows.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.stars}</td>
                      <td>{item.city}</td>
                      <td>{item.cuisine}</td>
                      <td>{item.year_awarded}</td>
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
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Tag ID</th>
                    <th>Restaurant</th>
                    <th>Salt</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((item) => {
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
              <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search by email or name" />
            </label>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Region</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && <tr><td colSpan={7} style={{ opacity: 0.6 }}>No users found.</td></tr>}
                  {users.map((u) => (
                    <tr key={u.id}>
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
                      {selectedUserHistory.checkins.length === 0 && (
                        <tr><td colSpan={4} style={{ opacity: 0.6 }}>No check-ins yet.</td></tr>
                      )}
                      {selectedUserHistory.checkins.map((ci) => (
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
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Admin</th>
                    <th>Action</th>
                    <th>Target</th>
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
          </div>
        </section>
      )}
    </div>
  )
}
