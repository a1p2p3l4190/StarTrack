import { useState } from 'react'
import { restaurantLabel } from './utils'

export function ToastStack({ toasts, onDismiss }) {
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

export function SkeletonStack({ count = 4, height = 40, style }) {
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
export function SortableTh({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey
  return (
    <th aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sort-th" onClick={() => onSort(sortKey)}>
        {label}{active && <span aria-hidden="true">{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
      </button>
    </th>
  )
}

export function StatusBadge({ active, activeLabel, inactiveLabel }) {
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
export function TypeaheadInput({ id, label, value, onChange, options, placeholder, onAddOption, addLabel }) {
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
export function RestaurantSelect({ label, value, onChange, restaurants, placeholder }) {
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
