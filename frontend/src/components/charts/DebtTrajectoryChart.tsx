import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts'
import type { MonthSnapshot, DebtAccount } from '../../api/types'

interface Props {
  snapshots: MonthSnapshot[]
  debts: DebtAccount[]
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

// Color palette for debt lines
const DEBT_COLORS = ['#ef4444', '#f97316', '#eab308', '#ec4899', '#f43f5e', '#fb923c']

export default function DebtTrajectoryChart({ snapshots, debts, height = 260 }: Props) {
  if (!debts.length || !snapshots.length) {
    return (
      <div className="h-32 flex items-center justify-center text-gray-600 text-sm">
        No debt accounts to display
      </div>
    )
  }

  // Downsample to yearly
  const yearly = snapshots.filter((_, i) => (i + 1) % 12 === 0 || i === snapshots.length - 1)

  // Find PSLF forgiveness year
  const pslfSnap = snapshots.find(s => (s.pslf_qualifying_payments ?? 0) >= 120)
  const pslfYear = pslfSnap?.year

  // Build chart data: one column per year, one property per debt
  const data = yearly.map(s => {
    const row: Record<string, number | string> = { year: s.year }
    for (const debt of debts) {
      // debt_balances is keyed by debt ID
      row[debt.id] = Math.round(s.debt_balances?.[debt.id] ?? 0)
    }
    return row
  })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a1f1a" />
        <XAxis dataKey="year" stroke="#5c443a" tick={{ fill: '#7a5c4e', fontSize: 11 }} />
        <YAxis
          stroke="#5c443a"
          tick={{ fill: '#7a5c4e', fontSize: 11 }}
          tickFormatter={formatDollar}
          width={64}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#181210', border: '1px solid #3d2e27', borderRadius: '8px', fontSize: 12 }}
          labelStyle={{ color: '#9e7b68', marginBottom: 4 }}
          formatter={(v: number, id: string) => {
            const debt = debts.find(d => d.id === id)
            return [formatFull(v), debt?.name ?? id]
          }}
        />
        <Legend
          formatter={(id: string) => {
            const debt = debts.find(d => d.id === id)
            return <span style={{ color: '#9e7b68', fontSize: 11 }}>{debt?.name ?? id}</span>
          }}
        />
        <ReferenceLine y={0} stroke="#3d2e27" />

        {pslfYear && (
          <ReferenceLine
            x={pslfYear}
            stroke="#a855f7"
            strokeDasharray="5 3"
            strokeWidth={1.5}
            label={{ value: '✦ PSLF Forgiveness', fill: '#a855f7', fontSize: 10, position: 'insideTopLeft' }}
          />
        )}

        {debts.map((debt, i) => (
          <Line
            key={debt.id}
            type="monotone"
            dataKey={debt.id}
            stroke={DEBT_COLORS[i % DEBT_COLORS.length]}
            strokeWidth={2}
            dot={false}
            name={debt.id}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
