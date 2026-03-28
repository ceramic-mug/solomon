import { Target, CheckCircle2, Clock } from 'lucide-react'
import type { GoalProgress } from '../../api/types'

interface Props {
  goals: GoalProgress[]
  startYear: number
  startMonth: number
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function monthLabel(month: number, startYear: number, startMonth: number) {
  if (month < 0) return null
  const totalMonth = startMonth - 1 + month
  const year = startYear + Math.floor(totalMonth / 12)
  const mo = totalMonth % 12
  return `${MONTH_NAMES[mo]} ${year}`
}

export default function GoalsPanel({ goals, startYear, startMonth }: Props) {
  if (!goals?.length) return null

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Target size={15} className="text-emerald-400" />
        <span className="text-sm font-semibold text-white">Savings Goals</span>
      </div>

      {goals.map(g => {
        const pct = Math.min(100, (g.current_balance / g.target_balance) * 100)
        const projPct = Math.min(100, (g.projected_balance / g.target_balance) * 100)
        const reached = g.reached_month >= 0
        const label = g.goal_label || g.name
        const dateStr = monthLabel(g.reached_month, startYear, startMonth)

        return (
          <div key={g.account_id} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                {reached
                  ? <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                  : <Clock size={12} className="text-gray-500 shrink-0" />
                }
                <span className="text-xs font-medium text-gray-200 truncate">{label}</span>
              </div>
              <span className="text-[10px] text-gray-500 ml-2 shrink-0">
                {fmt(g.projected_balance)} / {fmt(g.target_balance)}
              </span>
            </div>

            {/* Progress bar: current (solid) + projected (lighter) */}
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden relative">
              {/* Projected bar (lighter background) */}
              <div
                className={`absolute inset-y-0 left-0 rounded-full ${reached ? 'bg-emerald-700/40' : 'bg-emerald-900/40'}`}
                style={{ width: `${projPct}%` }}
              />
              {/* Current balance (solid) */}
              <div
                className={`absolute inset-y-0 left-0 rounded-full ${reached ? 'bg-emerald-400' : 'bg-emerald-600'}`}
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px]">
              <span className="text-gray-600">Now: {fmt(g.current_balance)}</span>
              {reached && dateStr ? (
                <span className="text-emerald-400">Reached {dateStr}</span>
              ) : projPct >= 100 ? (
                <span className="text-emerald-400">Reached within horizon</span>
              ) : (
                <span className="text-gray-600">{Math.round(projPct)}% of goal projected</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
