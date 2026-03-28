import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts'
import type { MonthSnapshot, LifeEvent } from '../../api/types'

interface Props {
  snapshots: MonthSnapshot[]
  lifeEvents?: LifeEvent[]
  height?: number
}

function formatDollar(v: number) {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`
  return `$${v.toFixed(0)}`
}

function formatFull(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
}

function monthLabel(calMonth: number, year: number) {
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${names[(calMonth - 1) % 12]} ${year}`
}

const LINE_LABELS: Record<string, string> = {
  netWorth: 'Net Worth',
  debt: 'Total Debt',
  investments: 'Investments',
}

export default function FinancialOverviewChart({ snapshots, lifeEvents = [], height = 340 }: Props) {
  // Downsample to yearly
  const yearly = snapshots.filter((_, i) => (i + 1) % 12 === 0 || i === snapshots.length - 1)

  // Find debt-free year (total_debt drops to near zero)
  const debtFreeSnap = snapshots.find(s => s.total_debt < 100 && s.total_debt >= 0)
  const debtFreeYear = debtFreeSnap?.year

  // Find PSLF forgiveness year
  const pslfSnap = snapshots.find(s => (s.pslf_qualifying_payments ?? 0) >= 120)
  const pslfYear = pslfSnap?.year

  // Collect unique life-event years → names
  const eventByYear = new Map<number, string>()
  for (const ev of (lifeEvents ?? [])) {
    const snap = snapshots[Math.min(ev.month, snapshots.length - 1)]
    if (snap) {
      const yr = snap.year
      if (!eventByYear.has(yr)) eventByYear.set(yr, ev.name)
    }
  }

  const data = yearly.map(s => ({
    year: s.year,
    netWorth: Math.round(s.net_worth),
    debt: Math.round(s.total_debt),
    investments: Math.round(s.total_investments),
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 16, right: 24, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="year" stroke="#4b5563" tick={{ fill: '#6b7280', fontSize: 11 }} />
        <YAxis
          stroke="#4b5563"
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickFormatter={formatDollar}
          width={64}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: 12 }}
          labelStyle={{ color: '#9ca3af', marginBottom: 4 }}
          formatter={(v: number, name: string) => [formatFull(v), LINE_LABELS[name] ?? name]}
        />
        <Legend
          formatter={value => (
            <span style={{ color: '#9ca3af', fontSize: 11 }}>{LINE_LABELS[value] ?? value}</span>
          )}
        />
        <ReferenceLine y={0} stroke="#374151" strokeWidth={1} />

        {/* Debt-free milestone */}
        {debtFreeYear && (
          <ReferenceLine
            x={debtFreeYear}
            stroke="#10b981"
            strokeDasharray="5 3"
            strokeWidth={1.5}
            label={{ value: '🏁 Debt Free', fill: '#10b981', fontSize: 10, position: 'insideTopLeft' }}
          />
        )}

        {/* PSLF forgiveness */}
        {pslfYear && pslfYear !== debtFreeYear && (
          <ReferenceLine
            x={pslfYear}
            stroke="#a855f7"
            strokeDasharray="5 3"
            strokeWidth={1.5}
            label={{ value: '✦ PSLF', fill: '#a855f7', fontSize: 10, position: 'insideTopLeft' }}
          />
        )}

        {/* Life event markers */}
        {[...eventByYear.entries()].map(([yr, name]) => (
          <ReferenceLine
            key={yr}
            x={yr}
            stroke="#f59e0b"
            strokeDasharray="3 4"
            strokeWidth={1}
            label={{ value: `◆ ${name}`, fill: '#f59e0b', fontSize: 9, position: 'insideTopRight' }}
          />
        ))}

        <Line type="monotone" dataKey="investments" stroke="#10b981" strokeWidth={2} dot={false} name="investments" />
        <Line type="monotone" dataKey="debt" stroke="#ef4444" strokeWidth={2} dot={false} name="debt" />
        <Line type="monotone" dataKey="netWorth" stroke="#3b82f6" strokeWidth={2.5} dot={false} name="netWorth" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
