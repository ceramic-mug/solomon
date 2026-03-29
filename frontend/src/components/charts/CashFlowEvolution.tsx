import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts'
import type { MonthSnapshot } from '../../api/types'

interface Props {
  snapshots: MonthSnapshot[]
}

const fmt = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

const fmtK = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`
  return `$${v.toFixed(0)}`
}

const SEGMENTS = [
  { key: 'taxes',     label: 'Taxes',       color: '#ef4444' },
  { key: 'expenses',  label: 'Expenses',    color: '#f97316' },
  { key: 'debt',      label: 'Debt Pmts',   color: '#a855f7' },
  { key: 'giving',    label: 'Giving',      color: '#14b8a6' },
  { key: 'investing', label: 'Investing',   color: '#10b981' },
  { key: 'free',      label: 'Free Cash',   color: '#3b82f6' },
] as const

// Snapshot indices corresponding to end-of-year (month index 11, 23, 59, 119, 239, 359)
const KEY_YEAR_OFFSETS = [0, 2, 4, 9, 19, 29]

interface SegmentRow {
  label: string
  taxes: number
  expenses: number
  debt: number
  giving: number
  investing: number
  free: number
  gross: number
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const row: SegmentRow = payload[0]?.payload
  return (
    <div style={{ backgroundColor: '#181210', border: '1px solid #3d2e27', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <p style={{ color: '#9e7b68', marginBottom: 6, fontWeight: 600 }}>{label} — Gross: {fmt(row.gross)}</p>
      {SEGMENTS.map(seg => {
        const v = row[seg.key]
        if (!v) return null
        const pct = row.gross > 0 ? ((v / row.gross) * 100).toFixed(0) : 0
        return (
          <div key={seg.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 2 }}>
            <span style={{ color: seg.color }}>{seg.label}</span>
            <span style={{ color: '#ede0d3' }}>{fmt(v)} <span style={{ color: '#7a5c4e' }}>({pct}%)</span></span>
          </div>
        )
      })}
    </div>
  )
}

export default function CashFlowEvolution({ snapshots }: Props) {
  if (!snapshots.length) return null

  const data: SegmentRow[] = KEY_YEAR_OFFSETS.map(yr => {
    const idx = Math.min((yr + 1) * 12 - 1, snapshots.length - 1)
    const s = snapshots[idx]
    if (!s) return null
    const free = Math.max(0, s.cash_flow)
    return {
      label: yr === 0 ? 'Yr 1' : `Yr ${yr + 1}`,
      taxes:    Math.round(s.taxes_paid),
      expenses: Math.round(s.total_expenses),
      debt:     Math.round(s.total_debt_payments),
      giving:   Math.round(s.total_giving),
      investing: Math.round(s.total_invest_contrib),
      free:     Math.round(free),
      gross:    Math.round(s.gross_income),
    }
  }).filter((x): x is SegmentRow => x !== null)

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-3">
        {SEGMENTS.map(s => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color, opacity: 0.8 }} />
            {s.label}
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke="#2a1f1a" vertical={false} />
          <XAxis dataKey="label" stroke="#5c443a" tick={{ fill: '#7a5c4e', fontSize: 11 }} />
          <YAxis stroke="#5c443a" tick={{ fill: '#7a5c4e', fontSize: 11 }} tickFormatter={fmtK} width={56} />
          <Tooltip content={<CustomTooltip />} />
          {SEGMENTS.map((seg, i) => (
            <Bar
              key={seg.key}
              dataKey={seg.key}
              stackId="budget"
              fill={seg.color}
              fillOpacity={0.75}
              radius={i === SEGMENTS.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
