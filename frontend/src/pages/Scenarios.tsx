import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listPlans, simulate, comparePlans } from '../api/client'
import { useState } from 'react'
import type { SimulationResult } from '../api/types'
import NetWorthChart from '../components/charts/NetWorthChart'
import { GitBranch, TrendingUp } from 'lucide-react'

function fmt(n: number | undefined | null) {
  if (n === undefined || n === null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default function Scenarios() {
  const { id: planId } = useParams<{ id: string }>()
  const [compareId, setCompareId] = useState<string | null>(null)

  const { data: plans = [] } = useQuery({
    queryKey: ['plans'],
    queryFn: listPlans,
  })

  const baseplan = plans.find(p => p.id === planId)
  const forks = plans.filter(p => p.parent_plan_id === planId || p.id === planId)

  // Simulate base plan on mount
  const { data: simA } = useQuery({
    queryKey: ['simulate', planId],
    queryFn: () => planId ? simulate(planId) : null,
    enabled: !!planId,
  })

  // Simulate comparison plan when selected
  const { data: simB } = useQuery({
    queryKey: ['simulate', compareId],
    queryFn: () => compareId ? simulate(compareId) : null,
    enabled: !!compareId,
  })

  const { data: comparison } = useQuery({
    queryKey: ['compare', planId, compareId],
    queryFn: () => planId && compareId ? comparePlans(planId, compareId) : null,
    enabled: !!planId && !!compareId,
  })

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Scenarios</h1>
        <p className="text-gray-500 text-sm mt-0.5">Compare forked plans side by side</p>
      </div>

      {/* Plan tree */}
      <div className="card">
        <h2 className="font-semibold text-white mb-4">Plan Tree</h2>
        <div className="flex gap-3 flex-wrap">
          {forks.map(plan => (
            <button
              key={plan.id}
              onClick={() => plan.id !== planId && setCompareId(plan.id === compareId ? null : plan.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                plan.id === planId
                  ? 'bg-blue-900/30 border-blue-700 text-blue-300 cursor-default'
                  : plan.id === compareId
                  ? 'bg-amber-900/30 border-amber-700 text-amber-300'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'
              }`}
            >
              {plan.id === planId ? <TrendingUp size={13} /> : <GitBranch size={13} />}
              {plan.created_by_ai && '✨ '}
              {plan.name}
            </button>
          ))}
        </div>
        {forks.length <= 1 && (
          <p className="text-gray-600 text-sm mt-4">Fork this plan to create alternative scenarios.</p>
        )}
      </div>

      {/* Chart comparison */}
      {simA && (
        <div className="card">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-3 h-0.5 bg-blue-400" />
              <span className="text-gray-400">{baseplan?.name}</span>
            </div>
            {simB && compareId && (
              <div className="flex items-center gap-2 text-sm">
                <div className="w-3 h-0.5 bg-amber-400" style={{ borderStyle: 'dashed' }} />
                <span className="text-gray-400">{plans.find(p => p.id === compareId)?.name}</span>
              </div>
            )}
          </div>
          <NetWorthChart
            snapshots={simA.monthly_snapshots}
            comparisonSnapshots={simB?.monthly_snapshots}
            height={300}
          />
        </div>
      )}

      {/* Delta table */}
      {comparison && (
        <div className="card">
          <h2 className="font-semibold text-white mb-4">Net Worth Delta</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left pb-3 font-medium">Year</th>
                  <th className="text-right pb-3 font-medium">{baseplan?.name}</th>
                  <th className="text-right pb-3 font-medium">{plans.find(p => p.id === compareId)?.name}</th>
                  <th className="text-right pb-3 font-medium">Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {comparison.deltas.map(d => (
                  <tr key={d.year}>
                    <td className="py-3 text-gray-300">Year {d.year}</td>
                    <td className="py-3 text-right text-blue-300">{fmt(d.plan_a_net_worth)}</td>
                    <td className="py-3 text-right text-amber-300">{fmt(d.plan_b_net_worth)}</td>
                    <td className={`py-3 text-right font-medium ${d.delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {d.delta >= 0 ? '+' : ''}{fmt(d.delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
