import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listPlans, createPlan, getPlan, simulate, comparePlans, compareRepayment } from '../api/client'
import { usePlanStore } from '../store/plan'
import FinancialOverviewChart from '../components/charts/FinancialOverviewChart'
import DebtTrajectoryChart from '../components/charts/DebtTrajectoryChart'
import CashFlowEvolution from '../components/charts/CashFlowEvolution'
import AnnualSummaryTable from '../components/charts/AnnualSummaryTable'
import ComparisonPanel from '../components/charts/ComparisonPanel'
import RepaymentComparisonPanel from '../components/charts/RepaymentComparisonPanel'
import SavingsBreakdownChart from '../components/charts/SavingsBreakdownChart'
import DebtFreedomPanel from '../components/panels/DebtFreedomPanel'
import GoalsPanel from '../components/panels/GoalsPanel'
import SensitivityPanel from '../components/panels/SensitivityPanel'
import SimpleAgent from '../components/chat/SimpleAgent'
import type { Plan, MonthSnapshot } from '../api/types'
import {
  Plus, GitBranch, TrendingUp, DollarSign, CreditCard, Landmark,
  MessageSquare, CalendarRange, Heart, Wallet, Calendar, RefreshCw, Lock, X,
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

function findDebtFreeSnap(snapshots: MonthSnapshot[]) {
  return snapshots.find(s => s.total_debt < 100) ?? null
}

function findPSLFSnap(snapshots: MonthSnapshot[]) {
  return snapshots.find(s => (s.pslf_qualifying_payments ?? 0) >= 120) ?? null
}

/** Last snapshot in a given calendar year */
function findSnapForYear(snapshots: MonthSnapshot[], year: number): MonthSnapshot | null {
  const hits = snapshots.filter(s => s.year === year)
  return hits[hits.length - 1] ?? null
}

interface StatCardProps {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  accent?: 'red' | 'green' | 'purple' | 'blue' | 'orange' | 'teal' | 'default'
  dimmed?: boolean
}

function StatCard({ label, value, sub, icon, accent = 'default', dimmed }: StatCardProps) {
  const accentClass: Record<string, string> = {
    red:     'text-red-400',
    green:   'text-emerald-400',
    purple:  'text-purple-400',
    blue:    'text-blue-400',
    orange:  'text-orange-400',
    teal:    'text-teal-400',
    default: 'text-white',
  }
  return (
    <div className={`stat-card transition-opacity ${dimmed ? 'opacity-40' : ''}`}>
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

type ChartView = 'overview' | 'debt' | 'cashflow' | 'savings' | 'table' | 'repayment' | 'comparison'

export default function Dashboard() {
  const qc = useQueryClient()
  const { activePlanId, setActivePlan, setPlans } = usePlanStore()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [tab, setTab] = useState<TabType>('income')
  const [chartView, setChartView] = useState<ChartView>('overview')
  const [comparePlanId, setComparePlanId] = useState<string | null>(null)
  const [whatIfSnapshots, setWhatIfSnapshots] = useState<MonthSnapshot[] | null>(null)
  const [hoveredYear, setHoveredYear] = useState<number | null>(null)
  const [lockedYear, setLockedYear] = useState<number | null>(null)

  const { data: plans = EMPTY_PLANS, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: listPlans,
  })

  useEffect(() => { setPlans(plans) }, [plans])

  const activePlan_id = activePlanId ?? plans[0]?.id
  useEffect(() => {
    if (activePlan_id && activePlan_id !== activePlanId) setActivePlan(activePlan_id)
  }, [activePlan_id])

  // Reset time-lock when switching plans
  useEffect(() => {
    setLockedYear(null)
    setHoveredYear(null)
  }, [activePlan_id])

  const { data: activePlan } = useQuery({
    queryKey: ['plan', activePlan_id],
    queryFn: () => getPlan(activePlan_id!),
    enabled: !!activePlan_id,
  })

  const { data: simResult, isFetching: simFetching, refetch: refetchSim } = useQuery({
    queryKey: ['simulate', activePlan_id],
    queryFn: () => simulate(activePlan_id!, { filing_status: 'mfj', household_size: 2 }),
    enabled: !!activePlan_id,
  })

  const { data: comparisonData } = useQuery({
    queryKey: ['compare', activePlan_id, comparePlanId],
    queryFn: () => comparePlans(activePlan_id!, comparePlanId!, true),
    enabled: !!activePlan_id && !!comparePlanId,
  })

  const { data: repaymentData } = useQuery({
    queryKey: ['repayment', activePlan_id],
    queryFn: () => compareRepayment(activePlan_id!, { filing_status: 'mfj', household_size: 2 }),
    enabled: !!activePlan_id && chartView === 'repayment',
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
  const hasStudentLoans = debtAccounts.some(d => d.type === 'student_loan')
  const hasPSLF = debtAccounts.some(d => d.pslf_eligible)
  const hasGiving = (firstSnap?.total_giving ?? 0) > 0 || (activePlan?.giving_targets?.length ?? 0) > 0
  const hasInvestments = (activePlan?.investment_accounts?.length ?? 0) > 0
  const multiPlan = plans.length > 1

  const totalInterestPaid = snapshots.reduce((s, snap) => s + snap.total_interest_paid, 0)
  const startingPSLFPayments = debtAccounts
    .filter(d => d.pslf_eligible)
    .reduce((max, d) => Math.max(max, d.pslf_payments_made ?? 0), 0)

  // ── Time-travel: active snapshot + annual aggregates ──
  const activeYear = lockedYear ?? hoveredYear
  const activeSnap = activeYear ? (findSnapForYear(snapshots, activeYear) ?? firstSnap) : firstSnap
  const isTimeTravel = activeSnap != null && activeSnap !== firstSnap
  const isPastDebtFree = debtFreeSnap != null && activeYear != null && activeYear > debtFreeSnap.year

  // When time-travelling, aggregate the full year for flow metrics (more intuitive than a single December month)
  const annualForYear = activeYear ? (() => {
    const yr = snapshots.filter(s => s.year === activeYear)
    if (!yr.length) return null
    const last = yr[yr.length - 1]
    return {
      grossIncome:   yr.reduce((s, m) => s + m.gross_income, 0),
      netIncome:     yr.reduce((s, m) => s + m.net_income, 0),
      cashFlow:      yr.reduce((s, m) => s + m.cash_flow, 0),
      debtPayments:  yr.reduce((s, m) => s + m.total_debt_payments, 0),
      interestPaid:  yr.reduce((s, m) => s + m.total_interest_paid, 0),
      // Stock values from end-of-year snapshot
      totalDebt:     last.total_debt,
      totalInvestments: last.total_investments,
      netWorth:      last.net_worth,
      // PSLF: if forgiveness has happened by this year, pin at 120
      pslfCount: (pslfSnap && activeYear >= pslfSnap.year)
        ? 120
        : Math.min(last.pslf_qualifying_payments ?? 0, 120),
    }
  })() : null

  function handleChartHover(year: number | null) {
    if (!lockedYear) setHoveredYear(year)
  }
  function handleChartClick(year: number) {
    setLockedYear(prev => prev === year ? null : year)
    setHoveredYear(null)
  }

  // ── Chart views (context-aware) ──
  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'income',      label: 'Income',   icon: <DollarSign size={13} /> },
    { key: 'expenses',    label: 'Expenses', icon: <CreditCard size={13} /> },
    { key: 'debts',       label: 'Debt',     icon: <CreditCard size={13} /> },
    { key: 'investments', label: 'Invest',   icon: <Landmark size={13} /> },
    { key: 'events',      label: 'Events',   icon: <CalendarRange size={13} /> },
    { key: 'giving',      label: 'Giving',   icon: <Heart size={13} /> },
  ]

  const allChartViews: { key: ChartView; label: string; show: boolean }[] = [
    { key: 'overview',   label: 'Overview',       show: true },
    { key: 'debt',       label: 'Debt',            show: hasDebts },
    { key: 'cashflow',   label: 'Budget',          show: true },
    { key: 'savings',    label: 'Savings',         show: hasInvestments },
    { key: 'table',      label: 'Annual Summary',  show: true },
    { key: 'repayment',  label: 'Repayment',       show: hasStudentLoans },
    { key: 'comparison', label: 'vs. Plan',        show: multiPlan },
  ]
  const chartViews = allChartViews.filter(v => v.show)

  // If current chartView is hidden (e.g. debts removed), fall back to overview
  const validView = chartViews.some(v => v.key === chartView) ? chartView : 'overview'

  const comparePlan = plans.find(p => p.id === comparePlanId)

  return (
    <div className="p-4 lg:p-6 max-w-[1500px] mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Your financial sandbox</p>
        </div>
        <div className="flex items-center gap-2">
          {simFetching ? (
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <RefreshCw size={12} className="animate-spin" /> Simulating…
            </span>
          ) : activePlan_id ? (
            <button
              onClick={() => refetchSim()}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1.5 rounded hover:bg-gray-800"
              title="Re-run simulation"
            >
              <RefreshCw size={12} /> Refresh
            </button>
          ) : null}
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
              {/* ── Time-travel context bar ── */}
              {firstSnap && (
                <div className="flex items-center gap-3 min-h-[24px]">
                  {isTimeTravel ? (
                    <>
                      <span className="text-xs text-gray-500">Viewing</span>
                      <span className="text-xs font-semibold text-white bg-gray-800 px-2 py-0.5 rounded">
                        {activeYear}
                      </span>
                      {lockedYear && (
                        <>
                          <Lock size={11} className="text-blue-400" />
                          <span className="text-[10px] text-blue-400">locked</span>
                          <button
                            onClick={() => setLockedYear(null)}
                            className="text-gray-600 hover:text-red-400 transition-colors"
                            title="Unlock"
                          >
                            <X size={12} />
                          </button>
                        </>
                      )}
                      <span className="text-[10px] text-gray-600 ml-1">
                        {hoveredYear && !lockedYear ? '— click chart to lock' : ''}
                      </span>
                      <button
                        onClick={() => { setLockedYear(null); setHoveredYear(null) }}
                        className="text-[10px] text-gray-600 hover:text-gray-400 ml-auto"
                      >
                        ← Back to now
                      </button>
                    </>
                  ) : firstSnap ? (
                    <span className="text-[10px] text-gray-600">
                      Hover the overview chart to explore any year · click to lock
                    </span>
                  ) : null}
                </div>
              )}

              {/* ── Stat strip ── */}
              {firstSnap && (
                <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 transition-all ${
                  isTimeTravel ? 'ring-1 ring-gray-700/50 rounded-xl p-1 -m-1' : ''
                }`}>
                  {/* Flow cards: monthly in default view, annual when time-travelling */}
                  <StatCard
                    label={isTimeTravel ? `Annual Net Income (${activeYear})` : 'Monthly Net Income'}
                    value={isTimeTravel ? fmt(annualForYear?.netIncome) : fmt(firstSnap.net_income)}
                    sub={isTimeTravel
                      ? `Gross: ${fmt(annualForYear?.grossIncome)}`
                      : `Gross: ${fmt(firstSnap.gross_income)}/mo`
                    }
                    icon={<DollarSign size={14} />}
                    accent="green"
                  />
                  <StatCard
                    label={isTimeTravel ? `Annual Cash Flow (${activeYear})` : 'Monthly Cash Flow'}
                    value={isTimeTravel ? fmt(annualForYear?.cashFlow) : fmt(firstSnap.cash_flow)}
                    sub={isTimeTravel ? undefined : 'After all obligations'}
                    icon={<Wallet size={14} />}
                    accent={(isTimeTravel ? (annualForYear?.cashFlow ?? 0) : firstSnap.cash_flow) >= 0 ? 'blue' : 'red'}
                  />
                  <StatCard
                    label={isTimeTravel ? `Annual Debt Service (${activeYear})` : 'Monthly Debt Service'}
                    value={isTimeTravel ? fmt(annualForYear?.debtPayments) : fmt(firstSnap.total_debt_payments)}
                    sub={isTimeTravel
                      ? `Interest: ${fmt(annualForYear?.interestPaid)}/yr`
                      : `Interest: ${fmt(firstSnap.total_interest_paid)}/mo`
                    }
                    icon={<CreditCard size={14} />}
                    accent="orange"
                    dimmed={isPastDebtFree && (annualForYear?.debtPayments ?? 0) === 0}
                  />
                  {/* Milestone: always from full simulation */}
                  <StatCard
                    label="Debt-Free Date"
                    value={debtFreeSnap ? calLabel(debtFreeSnap.calendar_month, debtFreeSnap.year) : (hasDebts ? 'Not in 30yr' : 'No debt')}
                    sub={debtFreeSnap ? `Total interest: ${fmtShort(totalInterestPaid)}` : undefined}
                    icon={<Calendar size={14} />}
                    accent={debtFreeSnap ? 'green' : (hasDebts ? 'red' : 'default')}
                    dimmed={isTimeTravel}
                  />
                  {/* PSLF (when applicable) or total debt */}
                  {hasPSLF ? (
                    <StatCard
                      label={isTimeTravel ? `PSLF Progress (${activeYear})` : 'PSLF Progress'}
                      value={isTimeTravel
                        ? `${annualForYear?.pslfCount ?? startingPSLFPayments}/120`
                        : `${startingPSLFPayments}/120`
                      }
                      sub={
                        isTimeTravel && (annualForYear?.pslfCount ?? 0) >= 120
                          ? '✓ Forgiven'
                          : pslfSnap
                            ? `Forgiveness: ${calLabel(pslfSnap.calendar_month, pslfSnap.year)}`
                            : 'No forgiveness in 30yr'
                      }
                      icon={<TrendingUp size={14} />}
                      accent={isTimeTravel && (annualForYear?.pslfCount ?? 0) >= 120 ? 'green' : 'purple'}
                    />
                  ) : (
                    <StatCard
                      label={isTimeTravel ? `Total Debt (${activeYear})` : 'Total Debt Now'}
                      value={isTimeTravel ? fmt(annualForYear?.totalDebt) : fmt(firstSnap.total_debt)}
                      icon={<TrendingUp size={14} />}
                      accent={(isTimeTravel ? (annualForYear?.totalDebt ?? 1) : firstSnap.total_debt) > 0 ? 'red' : 'green'}
                    />
                  )}
                  {/* Investments: stock value (end-of-year or 30yr) */}
                  <StatCard
                    label={isTimeTravel ? `Investments (${activeYear})` : 'Investments (30yr)'}
                    value={isTimeTravel ? fmtShort(annualForYear?.totalInvestments) : fmtShort(lastSnap?.total_investments)}
                    sub={`Net worth: ${fmtShort(isTimeTravel ? annualForYear?.netWorth : lastSnap?.net_worth)}`}
                    icon={<Landmark size={14} />}
                    accent="green"
                  />
                </div>
              )}

              {/* ── Main layout ── */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

                {/* LEFT: Charts + Agent */}
                <div className="lg:col-span-2 space-y-5">

                  {/* Chart card */}
                  <div className="card">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <div className="flex gap-1 flex-wrap">
                        {chartViews.map(v => (
                          <button
                            key={v.key}
                            onClick={() => setChartView(v.key)}
                            className={`px-3 py-1 text-xs rounded-md transition-colors ${
                              validView === v.key
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
                        {validView === 'overview' && (
                          <FinancialOverviewChart
                            snapshots={snapshots}
                            lifeEvents={activePlan.life_events ?? []}
                            height={300}
                            comparisonSnapshots={comparisonData?.plan_b_snapshots}
                            comparisonName={comparePlan?.name}
                            whatIfSnapshots={whatIfSnapshots ?? undefined}
                            accounts={activePlan.investment_accounts ?? []}
                            lockedYear={lockedYear}
                            onHoverYear={handleChartHover}
                            onClickYear={handleChartClick}
                          />
                        )}
                        {validView === 'debt' && (
                          <DebtTrajectoryChart
                            snapshots={snapshots}
                            debts={activePlan.debt_accounts}
                            height={300}
                          />
                        )}
                        {validView === 'cashflow' && (
                          <div>
                            <p className="text-xs text-gray-500 mb-3">Monthly budget composition at key years</p>
                            <CashFlowEvolution snapshots={snapshots} />
                          </div>
                        )}
                        {validView === 'savings' && (
                          <div>
                            <p className="text-xs text-gray-500 mb-3">Balance per account over time</p>
                            <SavingsBreakdownChart
                              snapshots={snapshots}
                              accounts={activePlan.investment_accounts ?? []}
                              height={300}
                            />
                          </div>
                        )}
                        {validView === 'table' && (
                          <AnnualSummaryTable snapshots={snapshots} />
                        )}
                        {validView === 'repayment' && (
                          repaymentData ? (
                            <RepaymentComparisonPanel
                              plans={repaymentData.plans}
                              startYear={activePlan.simulation_config.start_year}
                              startMonth={activePlan.simulation_config.start_month}
                            />
                          ) : (
                            <div className="h-48 flex items-center justify-center text-gray-600 text-sm">
                              Loading repayment comparison…
                            </div>
                          )
                        )}
                        {validView === 'comparison' && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-gray-500">Compare with:</span>
                              <select
                                value={comparePlanId ?? ''}
                                onChange={e => setComparePlanId(e.target.value || null)}
                                className="input text-xs flex-1"
                              >
                                <option value="">— select a plan —</option>
                                {plans.filter(p => p.id !== activePlan_id).map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </div>
                            {comparePlanId && comparisonData ? (
                              <ComparisonPanel
                                deltas={comparisonData.full_deltas}
                                planAName={activePlan.name}
                                planBName={comparePlan?.name ?? 'Plan B'}
                              />
                            ) : (
                              <div className="h-48 flex items-center justify-center text-gray-600 text-sm">
                                {comparePlanId ? 'Loading comparison…' : 'Select a second plan above to compare'}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Sensitivity sliders */}
                  {simResult && (
                    <SensitivityPanel
                      planId={activePlan.id}
                      simParams={{ filing_status: 'mfj', household_size: 2 }}
                      onResult={snaps => {
                        setWhatIfSnapshots(snaps)
                        if (snaps && validView !== 'overview') setChartView('overview')
                      }}
                    />
                  )}

                  {/* Natural language builder */}
                  <SimpleAgent planId={activePlan.id} />
                </div>

                {/* RIGHT: sidebar panels + Plan editor */}
                <div className="lg:col-span-1 space-y-5">

                  {/* Debt & PSLF panel — only when there are debts */}
                  {simResult && hasDebts && (
                    <DebtFreedomPanel snapshots={snapshots} plan={activePlan} />
                  )}

                  {/* Savings goals */}
                  {simResult?.goal_progress?.length ? (
                    <GoalsPanel
                      goals={simResult.goal_progress}
                      startYear={activePlan.simulation_config.start_year}
                      startMonth={activePlan.simulation_config.start_month}
                    />
                  ) : null}

                  {/* Plan elements editor */}
                  <div className="card flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="font-semibold text-white text-sm">Plan Elements</h2>
                      <span className="text-xs px-2 py-1 bg-gray-800 text-gray-400 rounded">Edit sandbox</span>
                    </div>

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
