export function nextTagId(devices) {
  let max = 0
  devices.forEach((d) => {
    const match = /^TAG-(\d+)$/.exec(d.tag_id || '')
    if (match) max = Math.max(max, parseInt(match[1], 10))
  })
  return `TAG-${String(max + 1).padStart(6, '0')}`
}

export function generateSalt() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function maskSalt(salt) {
  if (!salt || salt.length <= 8) return '••••••••'
  return `${salt.slice(0, 4)}…${salt.slice(-4)}`
}

export function restaurantLabel(r) {
  return `${r.name} — ${r.city} — ${'★'.repeat(r.stars)}`
}

export function downloadCsv(filename, header, rows) {
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

export function clampStars(value) {
  return Math.min(3, Math.max(1, Math.round(value) || 1))
}

export function clampPriceTier(value) {
  return Math.min(3, Math.max(0, Math.round(value) || 0))
}

// day_of_week matches JS's Date.getDay() (0=Sunday..6=Saturday), the same
// convention the backend's RestaurantHours uses.
export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Always renders a full Sun-Sat week in the editor, filling in any day
// missing from the saved set as closed/unset.
export function fillWeekHours(hours) {
  const byDay = new Map((hours || []).map((h) => [h.day_of_week, h]))
  return WEEKDAY_LABELS.map((_, day) => byDay.get(day) || { day_of_week: day, is_closed: true, open_time: '', close_time: '' })
}

// Clicking the active sort column flips direction; clicking a new one starts asc.
export function toggleSort(current, key) {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: 'asc' }
}
