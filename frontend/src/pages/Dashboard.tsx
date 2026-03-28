import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listPlans, createPlan, getPlan, simulate } from '../api/client'
import { usePlanStore } from '../store/plan'
import NetWorthChart from '../components/charts/NetWorthChart'
import CashFlowReservoir from '../components/charts/CashFlowReservoir'
import SimpleAgent from '../components/chat/SimpleAgent'
import type { Plan } from '../api/types'
import { Plus, GitBranch, TrendingUp, DollarSign, CreditCard, Landmark, MessageSquare, CalendarRange, Heart } from 'lucide-react'
import { IncomeTab, ExpensesTab, DebtsTab, InvestmentsTab, EventsTab, GivingTab } from '../components/forms/PlanComponents'

const EMPTY_PLANS: Plan[] = []

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
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

type TabType = 'income' | 'expenses' | 'debts' | 'investments' | 'events' | 'giving'

function TabContent({ tab, plan }: { tab: TabType; plan: Plan }) {
  switch (tab) {
    case 'income':      return <IncomeTab plan={plan} />
    case 'expenses':    return <ExpensesTab plan={plan} />
    case 'debts':       return <DebtsTab plan={plan} />
    case 'investments': return <InvestmentsTab plan={plan} />
    case 'events':      return <EventsTab plan={plan} />
    case 'giving':      return <GivingTab plan={plan} />
    default:            return null
  }
}

export default function Dashboard() {
  const qc = useQueryClient()
  const { activePlanId, setActivePlan, setPlans } = usePlanStore()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [tab, setTab] = useState<TabType>('income')

  const { data: plans = EMPTY_PLANS, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: listPlans,
  })

  // Sync server data into Zustand store
  useEffect(() => {
    setPlans(plans)
  }, [plans])

  const initialActive = activePlanId ?? plans[0]?.id
  useEffect(() => {
    if (initialActive && initialActive !== activePlanId) {
      setActivePlan(initialActive)
    }
  }, [initialActive])

  // Fetch full active plan with all sub-components
  const { data: activePlan } = useQuery({
    queryKey: ['plan', initialActive],
    queryFn: () => getPlan(initialActive!),
    enabled: !!initialActive,
  })

  // Run simulation based on active plan id (refetches when invalidated)
  const { data: simResult } = useQuery({
    queryKey: ['simulate', initialActive],
    queryFn: () => simulate(initialActive!, { filing_status: 'mfj', household_size: 2 }),
    enabled: !!initialActive,
  })

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

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'income',      label: 'Income',      icon: <DollarSign size={15} /> },
    { key: 'expenses',    label: 'Expenses',    icon: <CreditCard size={15} /> },
    { key: 'debts',       label: 'Debt',        icon: <CreditCard size={15} /> },
    { key: 'investments', label: 'Investments', icon: <Landmark size={15} /> },
    { key: 'events',      label: 'Events',      icon: <CalendarRange size={15} /> },
    { key: 'giving',      label: 'Giving',      icon: <Heart size={15} /> },
  ]

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto space-y-6">
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
          <div className="flex gap-2 overflow-x-auto pb-1 border-b border-gray-800">
            {plans.map(plan => (
              <button
                key={plan.id}
                onClick={() => setActivePlan(plan.id)}
                className={`flex-shrink-0 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                  plan.id === initialActive
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                {plan.created_by_ai && <span className="mr-1.5">✨</span>}
                {plan.name}
                {plan.parent_plan_id && <GitBranch size={12} className="inline ml-1.5 opacity-60" />}
              </button>
            ))}
          </div>

          {activePlan && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              
              {/* LEFT COLUMN: Stats, Chart, Agent */}
              <div className="lg:col-span-2 space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard
                    label="Net Worth (30yr)"
                    value={fmt(lastSnap?.net_worth)}
                    icon={<TrendingUp size={16} />}
                    positive={lastSnap ? lastSnap.net_worth > 0 : undefined}
                  />
                  <StatCard
                    label="Monthly Net Income"
                    value={fmt(firstSnap?.net_income)}
                    icon={<DollarSign size={16} />}
                  />
                  <StatCard
                    label="Total Debt"
                    value={fmt(firstSnap?.total_debt)}
                    icon={<CreditCard size={16} />}
                    positive={false}
                  />
                  <StatCard
                    label="Investments (30yr)"
                    value={fmt(lastSnap?.total_investments)}
                    icon={<Landmark size={16} />}
                    positive
                  />
                </div>

                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-white">Net Worth Projection</h2>
                    <div className="flex items-center gap-2">
                      <Link to={`/plans/${activePlan.id}/chat`} className="btn-ghost text-sm flex items-center gap-1.5">
                        <MessageSquare size={13} />Advanced AI
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

                <SimpleAgent planId={activePlan.id} />

                {firstSnap && <CashFlowReservoir snapshot={firstSnap} />}
              </div>

              {/* RIGHT COLUMN: Plan Component Editor */}
              <div className="lg:col-span-1 space-y-4">
                <div className="card h-full flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-semibold text-white">Plan Elements</h2>
                    <span className="text-xs px-2 py-1 bg-gray-800 text-gray-400 rounded">Sandboxing</span>
                  </div>
                  
                  {/* Tab strip */}
                  <div className="flex gap-1 border-b border-gray-800 overflow-x-auto py-1 mb-4 hide-scrollbar">
                    {tabs.map(t => (
                      <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          tab === t.key
                            ? 'bg-gray-800 text-white'
                            : 'text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        {t.icon}{t.label}
                      </button>
                    ))}
                  </div>

                  {/* Tab content */}
                  <div className="flex-1 overflow-y-auto max-h-[600px] pr-1">
                    <TabContent tab={tab} plan={activePlan} />
                  </div>
                </div>
              </div>

            </div>
          )}
        </>
      )}
    </div>
  )
}
