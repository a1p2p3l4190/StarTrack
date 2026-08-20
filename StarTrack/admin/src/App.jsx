import { useEffect, useMemo, useState } from 'react'
import './styles.css'
import { api, getToken, setToken } from './api'
import { useActionGuard, useToasts } from './lib/hooks'
import { ToastStack } from './lib/ui'
import { restaurantLabel } from './lib/utils'
import LoginPanel from './LoginPanel'
import DashboardTab from './tabs/DashboardTab'
import RestaurantsTab from './tabs/RestaurantsTab'
import DevicesTab from './tabs/DevicesTab'
import SecurityTab from './tabs/SecurityTab'
import ReportsTab from './tabs/ReportsTab'
import UsersTab from './tabs/UsersTab'
import AuditTab from './tabs/AuditTab'

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'restaurants', label: 'Restaurant Engine' },
  { key: 'devices', label: 'NFC Inventory' },
  { key: 'security', label: 'Security Dashboard' },
  { key: 'reports', label: 'Review Reports' },
  { key: 'users', label: 'Users' },
  { key: 'audit', label: 'Audit Log' },
]

export default function App() {
  const [currentAdmin, setCurrentAdmin] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const toast = useToasts()
  const guard = useActionGuard()

  const [tab, setTab] = useState('dashboard')
  const [globalSearch, setGlobalSearch] = useState('')

  // Data shared across multiple tabs (dropdowns, cross-tab lookups, the
  // global search bar, dashboard counts). Each tab's own UI state — search
  // text, pagination, sort, forms — lives inside that tab's component.
  const [restaurants, setRestaurants] = useState([])
  const [devices, setDevices] = useState([])
  const [cities, setCities] = useState([])
  const [cuisines, setCuisines] = useState([])
  const [stats, setStats] = useState(null)
  const [reports, setReports] = useState([])

  // Global search needs to match users beyond whatever page the Users tab
  // happens to have loaded, so it queries the backend directly.
  const [globalUserMatches, setGlobalUserMatches] = useState([])

  // "Jump to this record" requests from the global search bar (and, for
  // security, the dashboard's Work Queue) — each tab consumes its own via a
  // nonce-keyed effect so repeated clicks on the same record still fire.
  const [restaurantFocus, setRestaurantFocus] = useState(null)
  const [userFocus, setUserFocus] = useState(null)
  const [deviceFocus, setDeviceFocus] = useState(null)
  const [securityFocusNonce, setSecurityFocusNonce] = useState(null)

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

  // Global search bar needs to match users beyond whatever page the Users
  // tab happens to have loaded, so it queries the backend directly instead
  // of depending on that tab's own paginated list.
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

  async function fetchRestaurants() {
    try {
      const data = await api.restaurants()
      setRestaurants(data.restaurants || [])
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

  async function fetchStats() {
    try {
      const data = await api.adminStats()
      setStats(data)
    } catch (err) {
      toast.push('error', `Failed to load dashboard stats: ${err.message}`)
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

  async function refreshRestaurantsShared() {
    await Promise.all([fetchRestaurants(), fetchStats()])
  }

  function handleCityCreated(created) {
    setCities((prev) => (prev.some((c) => c.name === created.name) ? prev : [...prev, created].sort((a, b) => a.name.localeCompare(b.name))))
  }

  function handleCuisineCreated(created) {
    setCuisines((prev) => (prev.some((c) => c.name === created.name) ? prev : [...prev, created].sort((a, b) => a.name.localeCompare(b.name))))
  }

  const globalResults = useMemo(() => {
    const query = globalSearch.trim().toLowerCase()
    if (!query) return []
    return [
      ...restaurants.filter((r) => `${r.name} ${r.city} ${r.country}`.toLowerCase().includes(query)).slice(0, 5).map((r) => ({ type: 'Restaurant', label: restaurantLabel(r), tab: 'restaurants', id: r.id })),
      ...globalUserMatches.slice(0, 5).map((u) => ({ type: 'User', label: `${u.display_name} — ${u.email}`, tab: 'users', id: u.id })),
      ...devices.filter((d) => (d.tag_id || '').toLowerCase().includes(query)).slice(0, 5).map((d) => ({ type: 'NFC Device', label: d.tag_id, tab: 'devices', id: d.id })),
    ].slice(0, 8)
  }, [globalSearch, restaurants, globalUserMatches, devices])

  function openGlobalResult(result) {
    setGlobalSearch('')
    setTab(result.tab)
    const nonce = Date.now()
    if (result.type === 'Restaurant') {
      const item = restaurants.find((r) => r.id === result.id)
      if (item) setRestaurantFocus({ item, nonce })
    } else if (result.type === 'User') {
      const user = globalUserMatches.find((u) => u.id === result.id)
      if (user) setUserFocus({ user, nonce })
    } else if (result.type === 'NFC Device') {
      setDeviceFocus({ restaurantId: devices.find((d) => d.id === result.id)?.restaurant_id || null, nonce })
    }
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
            {TABS.map((t) => (
              <button key={t.key} className={tab === t.key ? 'pill active' : 'pill'} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          <button className="pill" onClick={logout}>{currentAdmin.display_name} · Log out</button>
        </div>
      </header>

      <div className="admin-global-search" style={{ position: 'relative', marginBottom: 20 }}>
        <input
          value={globalSearch}
          onChange={(e) => setGlobalSearch(e.target.value)}
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

      <div style={{ display: tab === 'dashboard' ? undefined : 'none' }}>
        <DashboardTab
          stats={stats}
          onRefreshStats={fetchStats}
          reportsCount={reports.length}
          disabledDeviceCount={devices.filter((d) => d.status === 'disabled').length}
          setTab={setTab}
          onOpenSecurity={() => { setTab('security'); setSecurityFocusNonce(Date.now()) }}
        />
      </div>

      <div style={{ display: tab === 'restaurants' ? undefined : 'none' }}>
        <RestaurantsTab
          restaurants={restaurants}
          cities={cities}
          onCityCreated={handleCityCreated}
          cuisines={cuisines}
          onCuisineCreated={handleCuisineCreated}
          toast={toast}
          guard={guard}
          onRestaurantsChanged={refreshRestaurantsShared}
          focus={restaurantFocus}
        />
      </div>

      <div style={{ display: tab === 'devices' ? undefined : 'none' }}>
        <DevicesTab
          devices={devices}
          restaurants={restaurants}
          cities={cities}
          cuisines={cuisines}
          toast={toast}
          guard={guard}
          onDevicesChanged={fetchDevices}
          onStatsChanged={fetchStats}
          focus={deviceFocus}
        />
      </div>

      <div style={{ display: tab === 'security' ? undefined : 'none' }}>
        <SecurityTab
          toast={toast}
          guard={guard}
          onDevicesChanged={fetchDevices}
          onStatsChanged={fetchStats}
          focus={securityFocusNonce}
        />
      </div>

      <div style={{ display: tab === 'reports' ? undefined : 'none' }}>
        <ReportsTab
          reports={reports}
          onReportsChanged={fetchReports}
          toast={toast}
          guard={guard}
        />
      </div>

      <div style={{ display: tab === 'users' ? undefined : 'none' }}>
        <UsersTab
          restaurants={restaurants}
          toast={toast}
          guard={guard}
          onStatsChanged={fetchStats}
          focus={userFocus}
        />
      </div>

      <div style={{ display: tab === 'audit' ? undefined : 'none' }}>
        <AuditTab toast={toast} />
      </div>
    </div>
  )
}
