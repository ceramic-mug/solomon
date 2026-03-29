import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { MonthSnapshot, InvestmentAccount } from '../../api/types'

interface Props {
  snapshots: MonthSnapshot[]
  accounts: InvestmentAccount[]
  height?: number
}

const COLORS = [
  '#10b981', '#3b82f6', '#a78bfa', '#f59e0b', '#ef4444',
  '#06b6d4', '#f472b6', '#84cc16', '#fb923c', '#818cf8',
]

function formatDollar(v: number) {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`
  return `$${v.toFixed(0)}`
}

function formatFull(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
}

const TYPE_LABELS: Record<string, string> = {
  trad_401k:    '401(k)',
  roth_401k:    'Roth 401(k)',
  trad_457b:    '457(b)',
  trad_ira:     'Trad IRA',
  roth_ira:     'Roth IRA',
  hsa:          'HSA',
  taxable:      'Taxable',
  '529':        '529',
  cash:         'Cash',
  savings:      'Savings',
  money_market: 'Money Market',
}

export default function SavingsBreakdownChart({ snapshots, accounts, height = 320 }: Props) {
  if (!snapshots.length || !accounts.length) return null

  // Downsample to yearly (last snapshot of each year group)
  const yearly = snapshots.filter((_, i) => (i + 1) % 12 === 0 || i === snapshots.length - 1)

  // Only include accounts that have non-zero balance at some point
  const activeAccounts = accounts.filter(acct =>
    yearly.some(s => (s.investment_balances?.[acct.id] ?? 0) > 0)
  )

  if (!activeAccounts.length) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-600 text-sm">
        No investment or savings accounts with balances
      </div>
    )
  }

  const data = yearly.map(s => {
    const row: Record<string, number> = { year: s.year }
    for (const acct of activeAccounts) {
      row[acct.id] = Math.round(s.investment_balances?.[acct.id] ?? 0)
    }
    return row
  })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 16, right: 24, bottom: 0, left: 0 }}>
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
            const acct = activeAccounts.find(a => a.id === id)
            const label = acct ? `${acct.name} (${TYPE_LABELS[acct.type] ?? acct.type})` : id
            return [formatFull(v), label]
          }}
        />
        <Legend
          formatter={(id: string) => {
            const acct = activeAccounts.find(a => a.id === id)
            if (!acct) return id
            return (
              <span style={{ color: '#9e7b68', fontSize: 11 }}>
                {acct.name}
                <span style={{ color: '#5c443a', marginLeft: 4 }}>
                  {TYPE_LABELS[acct.type] ?? acct.type}
                </span>
              </span>
            )
          }}
        />
        {activeAccounts.map((acct, i) => (
          <Line
            key={acct.id}
            type="monotone"
            dataKey={acct.id}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={false}
            name={acct.id}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
