import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listPlans, createPlan, simulate } from '../api/client'
import { usePlanStore } from '../store/plan'
import NetWorthChart from '../components/charts/NetWorthChart'
import type { Plan, SimulationResult } from '../api/types'
import { Plus, GitBranch, TrendingUp, DollarSign, CreditCard, Landmark, MessageSquare } from 'lucide-react'

const EMPTY_PLANS: Plan[] = []

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function StatCard({ label, value, icon, positive }: { label: string; value: string; icon: React.ReactNode; positive?: boolean }) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <span className="stat-label">{label}</span>
        <span className="text-gray-600">{icon}</span>
      </div>
      <span className={`stat-value ${positive === false ? 'negative' : positive ? 'positive' : ''}`}>{value}</span>
    </div>
  )
}

export default function Dashboard() {
  const qc = useQueryClient()
  const { activePlanId, setActivePlan, setPlans } = usePlanStore()
  const [simResult, setSimResult] = useState<SimulationResult | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  const { data: plans = EMPTY_PLANS, isLoading, isError } = useQuery({
    queryKey: ['plans'],
    queryFn: listPlans,
  })

  // Sync server data into Zustand store (kept separate from the query to
  // avoid side-effects inside select, which can cause re-render loops in v5)
  useEffect(() => {
    setPlans(plans)
  }, [plans])

  const activePlan = plans.find(p => p.id === activePlanId) ?? plans[0]

  useEffect(() => {
    if (activePlan) setActivePlan(activePlan.id)
  }, [activePlan?.id])

  // Auto-simulate when active plan changes
  useEffect(() => {
    if (!activePlan) return
    simulate(activePlan.id, { filing_status: 'mfj', household_size: 2 })
      .then(setSimResult)
      .catch(() => null)
  }, [activePlan?.id])

  const createMutation = useMutation({
    mutationFn: () => createPlan(newName || 'My Plan', ''),
    onSuccess: (plan) => {
      qc.invalidateQueries({ queryKey: ['plans'] })
      setActivePlan(plan.id)
      setShowCreate(false)
      setNewName('')
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Loading plans...
      </div>
    )
  }

  const lastSnap = simResult?.monthly_snapshots.at(-1)
  const firstSnap = simResult?.monthly_snapshots[0]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Your financial universe</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> New Plan
        </button>
      </div>

      {/* Create plan modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="card w-full max-w-sm space-y-4">
            <h2 className="font-semibold text-white">Create a new plan</h2>
            <input
              type="text"
              className="input w-full"
              placeholder="Plan name (e.g. Base Plan)"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createMutation.mutate()}
              autoFocus
            />
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {plans.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
            <TrendingUp size={32} className="text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">No plans yet</h2>
          <p className="text-gray-500 text-sm mb-6 max-w-sm">
            Create your first financial plan to start modeling your future — income, debt, investments, and giving.
          </p>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Create your first plan
          </button>
        </div>
      ) : (
        <>
          {/* Plan selector tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {plans.map(plan => (
              <button
                key={plan.id}
                onClick={() => setActivePlan(plan.id)}
                className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  plan.id === activePlan?.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                {plan.created_by_ai && <span className="mr-1.5">✨</span>}
                {plan.name}
                {plan.parent_plan_id && <GitBranch size={12} className="inline ml-1.5 opacity-60" />}
              </button>
            ))}
          </div>

          {activePlan && (
            <div className="space-y-6">
              {/* Stats row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Net Worth (30yr)"
                  value={lastSnap ? fmt(lastSnap.net_worth) : '—'}
                  icon={<TrendingUp size={16} />}
                  positive={lastSnap ? lastSnap.net_worth > 0 : undefined}
                />
                <StatCard
                  label="Monthly Net Income"
                  value={firstSnap ? fmt(firstSnap.net_income) : '—'}
                  icon={<DollarSign size={16} />}
                />
                <StatCard
                  label="Total Debt"
                  value={firstSnap ? fmt(firstSnap.total_debt) : '—'}
                  icon={<CreditCard size={16} />}
                  positive={false}
                />
                <StatCard
                  label="Investments (30yr)"
                  value={lastSnap ? fmt(lastSnap.total_investments) : '—'}
                  icon={<Landmark size={16} />}
                  positive
                />
              </div>

              {/* Net Worth Chart */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-white">Net Worth Projection</h2>
                  <div className="flex items-center gap-2">
                    <Link to={`/plans/${activePlan.id}/chat`} className="btn-ghost text-sm flex items-center gap-1.5">
                      <MessageSquare size={13} />Ask AI
                    </Link>
                    <Link to={`/plans/${activePlan.id}`} className="btn-ghost text-sm">
                      Edit plan →
                    </Link>
                  </div>
                </div>
                {simResult ? (
                  <NetWorthChart snapshots={simResult.monthly_snapshots} height={300} />
                ) : (
                  <div className="h-72 flex items-center justify-center text-gray-600 text-sm">
                    Simulating...
                  </div>
                )}
              </div>

              {/* Plan summary */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <SummaryCard title="Income Streams" count={activePlan.income_streams?.length ?? 0} link={`/plans/${activePlan.id}`} />
                <SummaryCard title="Debt Accounts" count={activePlan.debt_accounts?.length ?? 0} link={`/plans/${activePlan.id}`} />
                <SummaryCard title="Investment Accounts" count={activePlan.investment_accounts?.length ?? 0} link={`/plans/${activePlan.id}`} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SummaryCard({ title, count, link }: { title: string; count: number; link: string }) {
  return (
    <Link to={link} className="card flex items-center justify-between hover:border-gray-700 transition-colors">
      <span className="text-gray-400 text-sm">{title}</span>
      <span className="text-lg font-semibold text-white">{count}</span>
    </Link>
  )
}
