import type { RepaymentPlanSummary } from '../../api/types'

interface Props {
  plans: RepaymentPlanSummary[]
  startYear: number
  startMonth: number
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function monthLabel(month: number, startYear: number, startMonth: number) {
  if (month < 0) return '—'
  const totalMonth = startMonth - 1 + month
  const year = startYear + Math.floor(totalMonth / 12)
  const mo = totalMonth % 12
  return `${MONTH_NAMES[mo]} ${year}`
}

export default function RepaymentComparisonPanel({ plans, startYear, startMonth }: Props) {
  if (!plans?.length) return null

  // Find best net worth for highlighting
  const maxNW = Math.max(...plans.map(p => p.net_worth_30yr))
  const minInterest = Math.min(...plans.map(p => p.total_interest_paid))

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Repayment Strategy Comparison</p>
        <p className="text-[10px] text-gray-600 mt-0.5">PSLF-eligible loans switched to each strategy; all else held equal</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="px-4 py-2.5 text-left text-gray-500 font-medium">Strategy</th>
              <th className="px-4 py-2.5 text-right text-gray-500 font-medium">Total Interest</th>
              <th className="px-4 py-2.5 text-right text-gray-500 font-medium">Forgiven</th>
              <th className="px-4 py-2.5 text-right text-gray-500 font-medium">Debt-Free</th>
              <th className="px-4 py-2.5 text-right text-gray-500 font-medium">Net Worth 30yr</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p, i) => (
              <tr
                key={p.plan_name}
                className={`border-b border-gray-800/50 ${
                  p.current_strategy ? 'bg-blue-900/10' : i % 2 === 0 ? '' : 'bg-gray-800/20'
                }`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${p.current_strategy ? 'text-blue-300' : 'text-gray-300'}`}>
                      {p.plan_name}
                    </span>
                    {p.current_strategy && (
                      <span className="text-[10px] text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded">current</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={p.total_interest_paid === minInterest ? 'text-emerald-400 font-semibold' : 'text-orange-400'}>
                    {fmt(p.total_interest_paid)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {p.forgiveness_amount > 0 ? (
                    <div>
                      <p className="text-purple-400 font-semibold">{fmt(p.forgiveness_amount)}</p>
                      <p className="text-[10px] text-gray-600">{monthLabel(p.forgiveness_month, startYear, startMonth)}</p>
                    </div>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-gray-400">
                  {monthLabel(p.debt_free_month, startYear, startMonth)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={p.net_worth_30yr === maxNW ? 'text-emerald-400 font-semibold' : 'text-blue-300'}>
                    {fmt(p.net_worth_30yr)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
