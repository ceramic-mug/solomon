import type { HorizonDeltaFull } from '../../api/types'

interface Props {
  deltas: HorizonDeltaFull[]
  planAName: string
  planBName: string
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

function Delta({ v }: { v: number }) {
  const positive = v >= 0
  return (
    <span className={`font-semibold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
      {positive ? '+' : ''}{fmt(v)}
    </span>
  )
}

export default function ComparisonPanel({ deltas, planAName, planBName }: Props) {
  if (!deltas?.length) return null

  const metrics: { key: keyof HorizonDeltaFull; labelA: string; labelB: string; deltaLabel: string; invertDelta?: boolean }[] = [
    { key: 'plan_a_net_worth',    labelA: 'Net Worth',    labelB: 'Net Worth',    deltaLabel: 'Net Worth Δ' },
    { key: 'plan_a_total_debt',   labelA: 'Total Debt',   labelB: 'Total Debt',   deltaLabel: 'Debt Δ', invertDelta: true },
    { key: 'plan_a_investments',  labelA: 'Investments',  labelB: 'Investments',  deltaLabel: 'Investments Δ' },
  ]

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 grid grid-cols-[80px_1fr_1fr_1fr] gap-2 text-xs font-semibold text-gray-500">
        <span>Year</span>
        <span className="text-center truncate" title={planAName}>{planAName}</span>
        <span className="text-center truncate" title={planBName}>{planBName}</span>
        <span className="text-center">Net Worth Δ</span>
      </div>

      {deltas.map((d, i) => (
        <div
          key={d.year}
          className={`px-4 py-3 grid grid-cols-[80px_1fr_1fr_1fr] gap-2 text-xs border-b border-gray-800/50 ${
            i % 2 === 0 ? '' : 'bg-gray-800/20'
          }`}
        >
          <span className="font-mono text-gray-400 self-center">{d.year}yr</span>
          <div className="text-center space-y-0.5">
            <p className={`font-semibold ${d.plan_a_net_worth < 0 ? 'text-red-400' : 'text-blue-300'}`}>
              {fmt(d.plan_a_net_worth)}
            </p>
            <p className="text-[10px] text-gray-600">debt {fmt(d.plan_a_total_debt)}</p>
          </div>
          <div className="text-center space-y-0.5">
            <p className={`font-semibold ${d.plan_b_net_worth < 0 ? 'text-red-400' : 'text-blue-300'}`}>
              {fmt(d.plan_b_net_worth)}
            </p>
            <p className="text-[10px] text-gray-600">debt {fmt(d.plan_b_total_debt)}</p>
          </div>
          <div className="text-center self-center">
            <Delta v={d.net_worth_delta} />
          </div>
        </div>
      ))}

      <div className="px-4 py-2 text-[10px] text-gray-600">
        Δ = {planBName} minus {planAName} · positive = {planBName} leads
      </div>
    </div>
  )
}
