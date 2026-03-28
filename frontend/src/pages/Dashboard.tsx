import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listPlans, createPlan, getPlan, simulate } from '../api/client'
import { usePlanStore } from '../store/plan'
import FinancialOverviewChart from '../components/charts/FinancialOverviewChart'
import DebtTrajectoryChart from '../components/charts/DebtTrajectoryChart'
import CashFlowEvolution from '../components/charts/CashFlowEvolution'
import DebtFreedomPanel from '../components/panels/DebtFreedomPanel'
import SimpleAgent from '../components/chat/SimpleAgent'
import type { Plan, MonthSnapshot } from '../api/types'
import {
  Plus, GitBranch, TrendingUp, DollarSign, CreditCard, Landmark,
  MessageSquare, CalendarRange, Heart, Wallet, Calendar, RefreshCw,
} from 'lucide-react'
import { IncomeTab, ExpensesTab, DebtsTab, InvestmentsTab, EventsTab, GivingTab } from '../components/forms/PlanComponents'

const EMPTY_PLANS: Plan[] = []
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtShort(n: number | null | undefined) {
  if (n == null) return '—'
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
  return `$${n.toFixed(0)}`
}

function calLabel(calMonth: number, year: number) {
  return `${MONTH_NAMES[(calMonth - 1) % 12]} ${year}`
}

/** Find the first snapshot where total_debt < $100 */
function findDebtFreeSnap(snapshots: MonthSnapshot[]) {
  return snapshots.find(s => s.total_debt < 100) ?? null
}

/** Find the snapshot where PSLF qualifying payments first hit 120 */
function findPSLFSnap(snapshots: MonthSnapshot[]) {
  return snapshots.find(s => (s.pslf_qualifying_payments ?? 0) >= 120) ?? null
}

interface StatCardProps {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  accent?: 'red' | 'green' | 'purple' | 'blue' | 'orange' | 'default'
}

function StatCard({ label, value, sub, icon, accent = 'default' }: StatCardProps) {
  const accentClass: Record<string, string> = {
    red:     'text-red-400',
    green:   'text-emerald-400',
    purple:  'text-purple-400',
    blue:    'text-blue-400',
    orange:  'text-orange-400',
    default: 'text-white',
  }
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-1">
        <span className="stat-label">{label}</span>
        <span className="text-gray-600">{icon}</span>
      </div>
      <span className={`stat-value ${accentClass[accent]}`}>{value}</span>
      {sub && <p className="text-[11px] text-gray-600 mt-0.5">{sub}</p>}
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

type ChartView = 'overview' | 'debt' | 'cashflow'

export default function Dashboard() {
  const qc = useQueryClient()
  const { activePlanId, setActivePlan, setPlans } = usePlanStore()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [tab, setTab] = useState<TabType>('income')
  const [chartView, setChartView] = useState<ChartView>('overview')

  const { data: plans = EMPTY_PLANS, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: listPlans,
  })

  useEffect(() => { setPlans(plans) }, [plans])

  const activePlan_id = activePlanId ?? plans[0]?.id
  useEffect(() => {
    if (activePlan_id && activePlan_id !== activePlanId) setActivePlan(activePlan_id)
  }, [activePlan_id])

  const { data: activePlan } = useQuery({
    queryKey: ['plan', activePlan_id],
    queryFn: () => getPlan(activePlan_id!),
    enabled: !!activePlan_id,
  })

  const { data: simResult, isFetching: simFetching } = useQuery({
    queryKey: ['simulate', activePlan_id],
    queryFn: () => simulate(activePlan_id!, { filing_status: 'mfj', household_size: 2 }),
    enabled: !!activePlan_id,
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
      <div className="flex items-center justify-center h-full text-gray-500">Loading plans...</div>
    )
  }

  const snapshots = simResult?.monthly_snapshots ?? []
  const firstSnap = snapshots[0]
  const lastSnap = snapshots[snapshots.length - 1]
  const debtFreeSnap = findDebtFreeSnap(snapshots)
  const pslfSnap = findPSLFSnap(snapshots)
  const debtAccounts = activePlan?.debt_accounts ?? []
  const hasDebts = debtAccounts.length > 0
  const hasPSLF = debtAccounts.some(d => d.pslf_eligible)

  // Derived stats
  const totalInterestPaid = snapshots.reduce((s, snap) => s + snap.total_interest_paid, 0)
  const startingPSLFPayments = debtAccounts
    .filter(d => d.pslf_eligible)
    .reduce((max, d) => Math.max(max, d.pslf_payments_made ?? 0), 0)

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'income',      label: 'Income',      icon: <DollarSign size={13} /> },
    { key: 'expenses',    label: 'Expenses',    icon: <CreditCard size={13} /> },
    { key: 'debts',       label: 'Debt',        icon: <CreditCard size={13} /> },
    { key: 'investments', label: 'Invest',      icon: <Landmark size={13} /> },
    { key: 'events',      label: 'Events',      icon: <CalendarRange size={13} /> },
    { key: 'giving',      label: 'Giving',      icon: <Heart size={13} /> },
  ]

  const chartViews: { key: ChartView; label: string }[] = [
    { key: 'overview',  label: 'Net Worth · Debt · Investments' },
    { key: 'debt',      label: 'Debt Payoff Trajectories' },
    { key: 'cashflow',  label: 'Budget Over Time' },
  ]

  return (
    <div className="p-4 lg:p-6 max-w-[1500px] mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Your financial sandbox</p>
        </div>
        <div className="flex items-center gap-2">
          {simFetching && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <RefreshCw size={12} className="animate-spin" /> Simulating…
            </span>
          )}
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus size={15} /> New Plan
          </button>
        </div>
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
                  plan.id === activePlan_id
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
            <>
              {/* ── Stat strip ── */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard
                  label="Monthly Net Income"
                  value={fmt(firstSnap?.net_income)}
                  sub={firstSnap ? `Gross: ${fmt(firstSnap.gross_income)}` : undefined}
                  icon={<DollarSign size={14} />}
                  accent="green"
                />
                <StatCard
                  label="Free Cash Flow"
                  value={fmt(firstSnap?.cash_flow)}
                  sub="After all obligations"
                  icon={<Wallet size={14} />}
                  accent={firstSnap && firstSnap.cash_flow >= 0 ? 'blue' : 'red'}
                />
                <StatCard
                  label="Monthly Debt Service"
                  value={fmt(firstSnap?.total_debt_payments)}
                  sub={firstSnap ? `Interest: ${fmt(firstSnap.total_interest_paid)}/mo` : undefined}
                  icon={<CreditCard size={14} />}
                  accent="orange"
                />
                <StatCard
                  label="Debt-Free Date"
                  value={debtFreeSnap ? calLabel(debtFreeSnap.calendar_month, debtFreeSnap.year) : 'Not in 30yr'}
                  sub={debtFreeSnap ? `Total interest: ${fmtShort(totalInterestPaid)}` : undefined}
                  icon={<Calendar size={14} />}
                  accent={debtFreeSnap ? 'green' : 'red'}
                />
                <StatCard
                  label={hasPSLF ? 'PSLF Progress' : 'Total Debt Now'}
                  value={hasPSLF ? `${startingPSLFPayments}/120` : fmt(firstSnap?.total_debt)}
                  sub={hasPSLF
                    ? (pslfSnap ? `Forgiveness: ${calLabel(pslfSnap.calendar_month, pslfSnap.year)}` : 'No forgiveness in 30yr')
                    : undefined
                  }
                  icon={<TrendingUp size={14} />}
                  accent={hasPSLF ? 'purple' : 'red'}
                />
                <StatCard
                  label="Investments (30yr)"
                  value={fmtShort(lastSnap?.total_investments)}
                  sub={lastSnap ? `Net worth: ${fmtShort(lastSnap.net_worth)}` : undefined}
                  icon={<Landmark size={14} />}
                  accent="green"
                />
              </div>

              {/* ── Main layout ── */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

                {/* LEFT: Charts + Agent */}
                <div className="lg:col-span-2 space-y-5">

                  {/* Chart card with view toggle */}
                  <div className="card">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <div className="flex gap-1 flex-wrap">
                        {chartViews.map(v => (
                          <button
                            key={v.key}
                            onClick={() => setChartView(v.key)}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${
                              chartView === v.key
                                ? 'bg-gray-700 text-white'
                                : 'text-gray-500 hover:text-gray-300'
                            }`}
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                      <Link to={`/plans/${activePlan.id}/chat`} className="btn-ghost text-xs flex items-center gap-1.5 shrink-0">
                        <MessageSquare size={12} /> Advanced AI
                      </Link>
                    </div>

                    {!simResult ? (
                      <div className="h-72 flex items-center justify-center text-gray-600 text-sm">
                        {simFetching ? 'Running simulation…' : 'Add income or debts to simulate'}
                      </div>
                    ) : (
                      <>
                        {chartView === 'overview' && (
                          <FinancialOverviewChart
                            snapshots={snapshots}
                            lifeEvents={activePlan.life_events ?? []}
                            height={300}
                          />
                        )}
                        {chartView === 'debt' && (
                          <>
                            {hasDebts ? (
                              <DebtTrajectoryChart
                                snapshots={snapshots}
                                debts={activePlan.debt_accounts}
                                height={300}
                              />
                            ) : (
                              <div className="h-64 flex items-center justify-center text-gray-600 text-sm">
                                No debt accounts — add debts to track payoff trajectories
                              </div>
                            )}
                          </>
                        )}
                        {chartView === 'cashflow' && (
                          <div>
                            <p className="text-xs text-gray-500 mb-3">Monthly budget composition at key years</p>
                            <CashFlowEvolution snapshots={snapshots} />
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Natural language builder */}
                  <SimpleAgent planId={activePlan.id} />

                  {/* Budget insight callouts */}
                  {firstSnap && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        {
                          label: 'Taxes',
                          value: fmt(firstSnap.taxes_paid),
                          pct: firstSnap.gross_income > 0 ? ((firstSnap.taxes_paid / firstSnap.gross_income) * 100).toFixed(0) : '0',
                          color: 'text-red-400',
                          bg: 'bg-red-900/10 border-red-900/30',
                        },
                        {
                          label: 'Expenses',
                          value: fmt(firstSnap.total_expenses),
                          pct: firstSnap.gross_income > 0 ? ((firstSnap.total_expenses / firstSnap.gross_income) * 100).toFixed(0) : '0',
                          color: 'text-orange-400',
                          bg: 'bg-orange-900/10 border-orange-900/30',
                        },
                        {
                          label: 'Debt Service',
                          value: fmt(firstSnap.total_debt_payments),
                          pct: firstSnap.gross_income > 0 ? ((firstSnap.total_debt_payments / firstSnap.gross_income) * 100).toFixed(0) : '0',
                          color: 'text-purple-400',
                          bg: 'bg-purple-900/10 border-purple-900/30',
                        },
                        {
                          label: 'Investing',
                          value: fmt(firstSnap.total_invest_contrib),
                          pct: firstSnap.gross_income > 0 ? ((firstSnap.total_invest_contrib / firstSnap.gross_income) * 100).toFixed(0) : '0',
                          color: 'text-emerald-400',
                          bg: 'bg-emerald-900/10 border-emerald-900/30',
                        },
                      ].map(item => (
                        <div key={item.label} className={`rounded-xl border p-3 ${item.bg}`}>
                          <p className="text-xs text-gray-500 mb-1">{item.label} / mo</p>
                          <p className={`text-sm font-semibold ${item.color}`}>{item.value}</p>
                          <p className="text-[11px] text-gray-600 mt-0.5">{item.pct}% of gross</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* RIGHT: Debt Freedom + Plan Editor */}
                <div className="lg:col-span-1 space-y-5">

                  {/* Debt & PSLF panel */}
                  {simResult && (
                    <DebtFreedomPanel snapshots={snapshots} plan={activePlan} />
                  )}

                  {/* Plan elements editor */}
                  <div className="card flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="font-semibold text-white text-sm">Plan Elements</h2>
                      <span className="text-xs px-2 py-1 bg-gray-800 text-gray-400 rounded">Edit sandbox</span>
                    </div>

                    {/* Tab strip */}
                    <div className="flex gap-0.5 border-b border-gray-800 overflow-x-auto py-1 mb-3 hide-scrollbar">
                      {tabs.map(t => (
                        <button
                          key={t.key}
                          onClick={() => setTab(t.key)}
                          className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                            tab === t.key
                              ? 'bg-gray-800 text-white'
                              : 'text-gray-500 hover:text-gray-300'
                          }`}
                        >
                          {t.icon}{t.label}
                        </button>
                      ))}
                    </div>

                    <div className="overflow-y-auto max-h-[520px] pr-0.5">
                      <TabContent tab={tab} plan={activePlan} />
                    </div>
                  </div>
                </div>

              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
