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
import type { MonthSnapshot, LifeEvent, InvestmentAccount } from '../../api/types'

const SAVINGS_TYPES = new Set(['savings', 'money_market', 'cash'])

interface Props {
  snapshots: MonthSnapshot[]
  lifeEvents?: LifeEvent[]
  height?: number
  comparisonSnapshots?: MonthSnapshot[]
  whatIfSnapshots?: MonthSnapshot[]
  comparisonName?: string
  accounts?: InvestmentAccount[]
  lockedYear?: number | null
  onHoverYear?: (year: number | null) => void
  onClickYear?: (year: number) => void
}

function formatDollar(v: number) {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`
  return `$${v.toFixed(0)}`
}

function formatFull(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
}

const LINE_LABELS: Record<string, string> = {
  netWorth:          'Net Worth',
  debt:              'Total Debt',
  investments:       'Investments',
  savings:           'Liquid Savings',
  homeEquity:        'Home Equity',
  cashFlow:          'Cash Flow/mo',
  giving:            'Monthly Giving',
  accumulatedGiving: 'Accumulated Giving',
  netWorthB:         'Net Worth (B)',
  netWorthWhatIf:    'Net Worth (what-if)',
}

export default function FinancialOverviewChart({
  snapshots,
  lifeEvents = [],
  height = 340,
  comparisonSnapshots,
  whatIfSnapshots,
  comparisonName = 'Plan B',
  accounts = [],
  lockedYear,
  onHoverYear,
  onClickYear,
}: Props) {
  const yearly = snapshots.filter((_, i) => (i + 1) % 12 === 0 || i === snapshots.length - 1)

  const hasHomeEquity = yearly.some(s => (s.home_equity ?? 0) > 0)
  const savingsAccountIds = accounts.filter(a => SAVINGS_TYPES.has(a.type)).map(a => a.id)
  const hasSavings = savingsAccountIds.length > 0 &&
    yearly.some(s => savingsAccountIds.some(id => (s.investment_balances?.[id] ?? 0) > 0))
  const hasGiving = yearly.some(s => (s.total_giving ?? 0) > 0)
  const hasAccumulatedGiving = yearly.some(s => (s.accumulated_giving ?? 0) > 0)
  const hasComparison = !!comparisonSnapshots?.length
  const hasWhatIf = !!whatIfSnapshots?.length

  const compByYear = new Map<number, MonthSnapshot>()
  if (hasComparison) {
    comparisonSnapshots!.filter((_, i) => (i + 1) % 12 === 0 || i === comparisonSnapshots!.length - 1)
      .forEach(s => compByYear.set(s.year, s))
  }
  const whatIfByYear = new Map<number, MonthSnapshot>()
  if (hasWhatIf) {
    whatIfSnapshots!.filter((_, i) => (i + 1) % 12 === 0 || i === whatIfSnapshots!.length - 1)
      .forEach(s => whatIfByYear.set(s.year, s))
  }

  const debtFreeSnap = snapshots.find(s => s.total_debt < 100 && s.total_debt >= 0)
  const debtFreeYear = debtFreeSnap?.year
  const pslfSnap = snapshots.find(s => (s.pslf_qualifying_payments ?? 0) >= 120)
  const pslfYear = pslfSnap?.year

  const eventByYear = new Map<number, string>()
  for (const ev of lifeEvents) {
    const snap = snapshots[Math.min(ev.month, snapshots.length - 1)]
    if (snap && !eventByYear.has(snap.year)) eventByYear.set(snap.year, ev.name)
  }

  const data = yearly.map(s => {
    const savingsBalance = savingsAccountIds.reduce(
      (sum, id) => sum + (s.investment_balances?.[id] ?? 0), 0
    )
    const entry: Record<string, number | undefined> = {
      year:        s.year,
      netWorth:    Math.round(s.net_worth),
      debt:        Math.round(s.total_debt),
      investments: Math.round(s.total_investments),
      savings:     hasSavings ? Math.round(savingsBalance) : undefined,
      homeEquity:  hasHomeEquity ? Math.round(s.home_equity ?? 0) : undefined,
      cashFlow:          Math.round(s.cash_flow),
      giving:            hasGiving ? Math.round(s.total_giving) : undefined,
      accumulatedGiving: hasAccumulatedGiving ? Math.round(s.accumulated_giving ?? 0) : undefined,
    }
    if (hasComparison) {
      const b = compByYear.get(s.year)
      entry.netWorthB = b ? Math.round(b.net_worth) : undefined
    }
    if (hasWhatIf) {
      const w = whatIfByYear.get(s.year)
      entry.netWorthWhatIf = w ? Math.round(w.net_worth) : undefined
    }
    return entry
  })

  function handleMouseMove(e: any) {
    const year = e?.activePayload?.[0]?.payload?.year
    if (year != null) onHoverYear?.(year)
  }

  function handleMouseLeave() {
    onHoverYear?.(null)
  }

  function handleClick(e: any) {
    const year = e?.activePayload?.[0]?.payload?.year
    if (year != null) onClickYear?.(year)
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={data}
        margin={{ top: 16, right: 24, bottom: 0, left: 0 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        style={{ cursor: onClickYear ? 'crosshair' : 'default' }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#2a1f1a" />
        <XAxis dataKey="year" stroke="#3d2e27" tick={{ fill: '#7a5c4e', fontSize: 11 }} />
        <YAxis
          stroke="#3d2e27"
          tick={{ fill: '#7a5c4e', fontSize: 11 }}
          tickFormatter={formatDollar}
          width={64}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#181210', border: '1px solid #3d2e27', borderRadius: '8px', fontSize: 12 }}
          labelStyle={{ color: '#9e7b68', marginBottom: 4 }}
          formatter={(v: number, name: string) => [formatFull(v), LINE_LABELS[name] ?? name]}
        />
        <Legend
          formatter={value => (
            <span style={{ color: '#9e7b68', fontSize: 11 }}>{LINE_LABELS[value] ?? value}</span>
          )}
        />
        <ReferenceLine y={0} stroke="#3d2e27" strokeWidth={1} />

        {debtFreeYear && (
          <ReferenceLine
            x={debtFreeYear}
            stroke="#10b981"
            strokeDasharray="5 3"
            strokeWidth={1.5}
            label={{ value: '🏁 Debt Free', fill: '#10b981', fontSize: 10, position: 'insideTopLeft' }}
          />
        )}
        {pslfYear && pslfYear !== debtFreeYear && (
          <ReferenceLine
            x={pslfYear}
            stroke="#a855f7"
            strokeDasharray="5 3"
            strokeWidth={1.5}
            label={{ value: '✦ PSLF', fill: '#a855f7', fontSize: 10, position: 'insideTopLeft' }}
          />
        )}
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

        {/* Locked-year pin */}
        {lockedYear != null && (
          <ReferenceLine
            x={lockedYear}
            stroke="#ffffff"
            strokeWidth={2}
            strokeOpacity={0.7}
            label={{ value: `📍 ${lockedYear}`, fill: '#e5e7eb', fontSize: 10, position: 'insideTopLeft' }}
          />
        )}

        {hasHomeEquity && (
          <Line type="monotone" dataKey="homeEquity" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="homeEquity" />
        )}
        {hasSavings && (
          <Line type="monotone" dataKey="savings" stroke="#06b6d4" strokeWidth={1.5} dot={false} name="savings" />
        )}
        <Line type="monotone" dataKey="investments" stroke="#10b981" strokeWidth={2} dot={false} name="investments" />
        <Line type="monotone" dataKey="debt" stroke="#ef4444" strokeWidth={2} dot={false} name="debt" />
        <Line type="monotone" dataKey="cashFlow" stroke="#a78bfa" strokeWidth={1.5} dot={false} name="cashFlow" strokeDasharray="4 2" />
        {hasGiving && (
          <Line type="monotone" dataKey="giving" stroke="#14b8a6" strokeWidth={1.5} dot={false} name="giving" strokeDasharray="3 2" />
        )}
        {hasAccumulatedGiving && (
          <Line type="monotone" dataKey="accumulatedGiving" stroke="#2dd4bf" strokeWidth={2} dot={false} name="accumulatedGiving" strokeDasharray="6 2" />
        )}
        <Line type="monotone" dataKey="netWorth" stroke="#3b82f6" strokeWidth={2.5} dot={false} name="netWorth" />

        {hasComparison && (
          <Line type="monotone" dataKey="netWorthB" stroke="#93c5fd" strokeWidth={1.5} strokeDasharray="6 3" dot={false} name="netWorthB" />
        )}
        {hasWhatIf && (
          <Line type="monotone" dataKey="netWorthWhatIf" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 3" dot={false} name="netWorthWhatIf" />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
