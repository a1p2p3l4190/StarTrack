import { useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from 'recharts'

// Values below are the admin portal's dark-mode chart palette, validated
// with the dataviz skill's validate_palette.js against this app's actual
// panel surface (#131417): lightness band, chroma floor, CVD adjacent/
// all-pairs separation, and contrast all pass. Cities beyond the first 3
// fold into a muted "Other" slice rather than extending the categorical
// ramp — a 4th hue (yellow) fails the all-pairs CVD floor next to orange.
const INK_PRIMARY = '#ffffff'
const INK_SECONDARY = '#c3c2b7'
const INK_MUTED = '#898781'
const GRIDLINE = '#2c2c2a'
const SURFACE = '#131417'

const SERIES_VERIFIED = '#3987e5'
const SERIES_TOTAL = '#c3c2b7'

const CITY_SLOTS = ['#3987e5', '#d95926', '#199e70']
const CITY_OTHER = '#52514e'

function formatShortDate(iso) {
  const [, month, day] = iso.split('-')
  return `${Number(month)}/${Number(day)}`
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div style={{ background: '#17171c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: INK_PRIMARY }}>
      {label && <div style={{ color: INK_MUTED, marginBottom: 6 }}>{label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey || p.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: p.color, display: 'inline-block' }} />
          <span>{p.name}: {p.value}</span>
        </div>
      ))}
    </div>
  )
}

// 7-day check-in trend — Verified (highlighted, blue) vs Total attempts
// (muted, dashed) so the gap between the two reads as the failure rate.
export function CheckinTrendChart({ data }) {
  const formatted = useMemo(() => data.map((d) => ({ ...d, label: formatShortDate(d.date) })), [data])
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={formatted} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid stroke={GRIDLINE} vertical={false} />
        <XAxis dataKey="label" stroke={INK_MUTED} tick={{ fill: INK_MUTED, fontSize: 12 }} axisLine={{ stroke: GRIDLINE }} tickLine={false} />
        <YAxis stroke={INK_MUTED} tick={{ fill: INK_MUTED, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: GRIDLINE }} />
        <Legend wrapperStyle={{ fontSize: 12, color: INK_SECONDARY }} iconType="plainline" />
        <Line type="monotone" dataKey="total" name="Total attempts" stroke={SERIES_TOTAL} strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={{ r: 5 }} />
        <Line type="monotone" dataKey="verified" name="Verified" stroke={SERIES_VERIFIED} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// Verified check-ins by city — top 3 cities get a direct categorical slot,
// everything else folds into "Other" (see palette note above).
export function CityBreakdownChart({ data }) {
  const slices = useMemo(() => {
    const sorted = [...data].sort((a, b) => b.count - a.count)
    const top = sorted.slice(0, 3)
    const rest = sorted.slice(3)
    const otherCount = rest.reduce((sum, r) => sum + r.count, 0)
    const result = top.map((r, i) => ({ name: r.city, value: r.count, color: CITY_SLOTS[i] }))
    if (otherCount > 0) result.push({ name: 'Other', value: otherCount, color: CITY_OTHER })
    return result
  }, [data])

  const total = slices.reduce((sum, s) => sum + s.value, 0)
  if (total === 0) {
    return <p style={{ opacity: 0.6, fontSize: 13 }}>No verified check-ins yet.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={slices} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} stroke={SURFACE} strokeWidth={2}>
          {slices.map((s) => (
            <Cell key={s.name} fill={s.color} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend
          layout="vertical"
          verticalAlign="middle"
          align="right"
          wrapperStyle={{ fontSize: 12, color: INK_SECONDARY }}
          formatter={(value, entry) => `${value} (${entry.payload.value})`}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
