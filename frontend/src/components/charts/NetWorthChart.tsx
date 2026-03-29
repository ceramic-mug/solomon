import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Area,
  AreaChart,
} from 'recharts'
import type { MonthSnapshot, MonteCarloResult } from '../../api/types'

interface Props {
  snapshots: MonthSnapshot[]
  monteCarlo?: MonteCarloResult
  showMonteCarlo?: boolean
  comparisonSnapshots?: MonthSnapshot[]   // second plan for overlay
  height?: number
}

function formatDollar(v: number) {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`
  return `$${v.toFixed(0)}`
}

function formatTooltipDollar(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
}

export default function NetWorthChart({ snapshots, monteCarlo, showMonteCarlo, comparisonSnapshots, height = 320 }: Props) {
  // Downsample to yearly for readability (take month 11 of each year, i.e. every 12th)
  const yearly = snapshots.filter((_, i) => (i + 1) % 12 === 0 || i === snapshots.length - 1)

  const data = yearly.map((s, i) => {
    const row: Record<string, number | string> = {
      year: s.year,
      netWorth: Math.round(s.net_worth),
    }
    if (monteCarlo && showMonteCarlo) {
      const mcIdx = (i + 1) * 12 - 1
      row.p10 = Math.round(monteCarlo.p10[mcIdx] ?? 0)
      row.p25 = Math.round(monteCarlo.p25[mcIdx] ?? 0)
      row.p50 = Math.round(monteCarlo.p50[mcIdx] ?? 0)
      row.p75 = Math.round(monteCarlo.p75[mcIdx] ?? 0)
      row.p90 = Math.round(monteCarlo.p90[mcIdx] ?? 0)
    }
    if (comparisonSnapshots) {
      const comp = comparisonSnapshots.filter((_, j) => (j + 1) % 12 === 0 || j === comparisonSnapshots.length - 1)
      row.compNetWorth = Math.round(comp[i]?.net_worth ?? 0)
    }
    return row
  })

  if (showMonteCarlo && monteCarlo) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="p90p10" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a1f1a" />
          <XAxis dataKey="year" stroke="#5c443a" tick={{ fill: '#7a5c4e', fontSize: 11 }} />
          <YAxis stroke="#5c443a" tick={{ fill: '#7a5c4e', fontSize: 11 }} tickFormatter={formatDollar} width={60} />
          <Tooltip
            contentStyle={{ backgroundColor: '#181210', border: '1px solid #2a1f1a', borderRadius: '8px' }}
            labelStyle={{ color: '#9e7b68' }}
            formatter={(v: number) => [formatTooltipDollar(v)]}
          />
          <ReferenceLine y={0} stroke="#3d2e27" />
          {/* P10-P90 band */}
          <Area type="monotone" dataKey="p90" stroke="none" fill="url(#p90p10)" fillOpacity={1} stackId="band" />
          <Area type="monotone" dataKey="p10" stroke="none" fill="#0a0e1a" fillOpacity={1} stackId="band" />
          {/* Percentile lines */}
          <Line type="monotone" dataKey="p10" stroke="#1d4ed8" strokeWidth={1} dot={false} strokeDasharray="4 3" />
          <Line type="monotone" dataKey="p25" stroke="#2563eb" strokeWidth={1} dot={false} strokeDasharray="2 2" />
          <Line type="monotone" dataKey="p50" stroke="#3b82f6" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="p75" stroke="#2563eb" strokeWidth={1} dot={false} strokeDasharray="2 2" />
          <Line type="monotone" dataKey="p90" stroke="#1d4ed8" strokeWidth={1} dot={false} strokeDasharray="4 3" />
          {/* Deterministic line */}
          <Line type="monotone" dataKey="netWorth" stroke="#10b981" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a1f1a" />
        <XAxis dataKey="year" stroke="#5c443a" tick={{ fill: '#7a5c4e', fontSize: 11 }} />
        <YAxis stroke="#5c443a" tick={{ fill: '#7a5c4e', fontSize: 11 }} tickFormatter={formatDollar} width={60} />
        <Tooltip
          contentStyle={{ backgroundColor: '#181210', border: '1px solid #2a1f1a', borderRadius: '8px' }}
          labelStyle={{ color: '#9e7b68' }}
          formatter={(v: number, name: string) => [
            formatTooltipDollar(v),
            name === 'netWorth' ? 'Net Worth' : 'Comparison',
          ]}
        />
        <ReferenceLine y={0} stroke="#3d2e27" />
        <Line type="monotone" dataKey="netWorth" stroke="#3b82f6" strokeWidth={2.5} dot={false} name="netWorth" />
        {comparisonSnapshots && (
          <Line type="monotone" dataKey="compNetWorth" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" dot={false} name="compNetWorth" />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
