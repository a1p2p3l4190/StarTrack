import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { RestaurantSelect, SortableTh, StatusBadge, TypeaheadInput } from '../lib/ui'
import { downloadCsv, generateSalt, maskSalt, nextTagId, restaurantLabel, toggleSort } from '../lib/utils'

const DEVICE_PAGE_SIZE = 20

export default function DevicesTab({ devices, restaurants, cities, cuisines, toast, guard, onDevicesChanged, onStatsChanged, focus }) {
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

  // Tag ID is always a fresh auto-incrementing serial; salt is only
  // (re)generated when it's empty, so an in-progress "Regenerate" click
  // isn't clobbered by an unrelated devices refresh.
  useEffect(() => {
    setDeviceForm((f) => ({ tag_id: nextTagId(devices), salt: f.salt || generateSalt() }))
  }, [devices])

  // Global search bar jumps here with a device's restaurant to pre-select
  // in the provisioning form.
  useEffect(() => {
    if (focus) setDeviceRestaurantId(focus.restaurantId)
  }, [focus?.nonce])

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

  const reassignMatch = useMemo(
    () => restaurants.find((r) => r.id === reassignRestaurantId),
    [restaurants, reassignRestaurantId]
  )

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
        onDevicesChanged()
        onStatsChanged()
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
        onDevicesChanged()
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
        onDevicesChanged()
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
        onDevicesChanged()
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

  return (
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
  )
}
