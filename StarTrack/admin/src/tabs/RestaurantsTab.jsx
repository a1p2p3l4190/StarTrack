import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { SortableTh, TypeaheadInput } from '../lib/ui'
import { WEEKDAY_LABELS, clampPriceTier, clampStars, fillWeekHours, toggleSort } from '../lib/utils'

const RESTAURANT_PAGE_SIZE = 10
const EMPTY_RESTAURANT_FORM = { name: '', city: '', cuisine: '', stars: 1, year_awarded: 2026, reservation_release_day: 0, price_tier: 0, reservation_platform: '', reservation_url: '', photo_url: '' }
const RESERVATION_PLATFORMS = [
  { value: '', label: 'None' },
  { value: 'opentable', label: 'OpenTable' },
  { value: 'resy', label: 'Resy' },
  { value: 'website', label: "Restaurant's website" },
]

export default function RestaurantsTab({ restaurants, cities, onCityCreated, cuisines, onCuisineCreated, toast, guard, onRestaurantsChanged, focus }) {
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
  const restaurantFormInitialRef = useRef(JSON.stringify(EMPTY_RESTAURANT_FORM))

  const [importFile, setImportFile] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const importFileInputRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => fetchRestaurantTable(), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantSearch, restaurantPage, restaurantSort])

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

  // Global search bar jumps here with a specific restaurant to edit.
  useEffect(() => {
    if (focus) startEditRestaurant(focus.item)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce])

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

  async function refreshRestaurantViews() {
    await Promise.all([onRestaurantsChanged(), fetchRestaurantTable()])
  }

  const restaurantTotalPages = Math.max(1, Math.ceil(restaurantTableTotal / RESTAURANT_PAGE_SIZE))

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

  async function submitImport() {
    if (!importFile) {
      toast.push('error', 'Choose a CSV file first')
      return
    }
    await guard.run('restaurant-import', async () => {
      try {
        const result = await api.importRestaurants(importFile)
        setImportResult(result)
        setImportFile(null)
        if (importFileInputRef.current) importFileInputRef.current.value = ''
        const createdCount = result.created?.length || 0
        const skippedCount = result.skipped?.length || 0
        const failedCount = result.failed?.length || 0
        toast.push(failedCount ? 'error' : 'success', `${createdCount} created, ${skippedCount} skipped, ${failedCount} failed`)
        if (createdCount > 0) refreshRestaurantViews()
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

  return (
    <section className="section-grid">
      <div className="panel-card">
        <h2>Michelin Metadata Engine</h2>
        <p>Update star tiers, city metadata, and annual award changes with confidence.</p>
      </div>
      <div className="admin-panel">
        <div className="panel-header">
          <h3>Bulk Import Restaurants</h3>
        </div>
        <p className="field-hint" style={{ display: 'block', marginBottom: 12 }}>
          Upload a CSV to add many restaurants at once — e.g. a new Michelin Guide release. Required columns: <code>name</code>, <code>city</code>, <code>cuisine</code>, <code>stars</code>.
          Optional: <code>country</code>, <code>address</code>, <code>year_awarded</code>, <code>price_tier</code>, <code>reservation_platform</code>, <code>reservation_url</code>, <code>reservation_release_day</code>, <code>photo_url</code>.
          Rows matching an existing restaurant's name and city are skipped rather than duplicated.
        </p>
        <div className="combo-row">
          <input
            ref={importFileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
          />
          <button type="button" className="icon-btn" disabled={!importFile || guard.isPending('restaurant-import')} onClick={submitImport}>
            {guard.isPending('restaurant-import') ? 'Importing…' : 'Import CSV'}
          </button>
        </div>
        {importResult && (
          <div style={{ marginTop: 16 }}>
            <p className="field-hint" style={{ display: 'block', marginBottom: 8 }}>
              {importResult.created?.length || 0} created, {importResult.skipped?.length || 0} skipped, {importResult.failed?.length || 0} failed
            </p>
            {(importResult.skipped?.length > 0 || importResult.failed?.length > 0) && (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Name</th>
                      <th>Result</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(importResult.failed || []).map((r) => (
                      <tr key={`failed-${r.row}`}>
                        <td>{r.row}</td>
                        <td>{r.name || '—'}</td>
                        <td>Failed</td>
                        <td>{r.reason}</td>
                      </tr>
                    ))}
                    {(importResult.skipped || []).map((r) => (
                      <tr key={`skipped-${r.row}`}>
                        <td>{r.row}</td>
                        <td>{r.name || '—'}</td>
                        <td>Skipped</td>
                        <td>{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
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
              onCityCreated(created)
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
              onCuisineCreated(created)
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
  )
}
