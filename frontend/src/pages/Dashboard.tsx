import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listPlans, createPlan, getPlan, simulate, comparePlans, compareRepayment, updatePlan, updateInvestment, updateGiving } from '../api/client'
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
import PlanBuilderWizard from '../components/wizard/PlanBuilderWizard'
import type { Plan, MonthSnapshot, SimulationConfig } from '../api/types'
import {
  Plus, GitBranch, TrendingUp, DollarSign, CreditCard, Landmark,
  MessageSquare, CalendarRange, Heart, Wallet, Calendar, RefreshCw, Lock, X,
  ShieldCheck, Zap, Settings2, HelpCircle, Sparkles, ChevronRight
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

function TargetCashFlowInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // Convert legacy values (> 1.0) into a sensible default percentage like 10%
  const initialPercent = value > 1.0 ? 10 : Math.round(value * 100)
  const [local, setLocal] = useState(initialPercent)
  
  useEffect(() => {
    setLocal(value > 1.0 ? 10 : Math.round(value * 100))
  }, [value])

  const handleSave = (val: number) => {
    // Save as a decimal (0.0 to 1.0) to the backend
    onChange(val / 100)
  }

  return (
    <div className="pt-2 space-y-3">
      <div className="flex items-center gap-2">
        <input 
          type="number" 
          value={local} 
          min="0"
          max="100"
          onChange={e => setLocal(parseInt(e.target.value) || 0)} 
          onBlur={() => handleSave(local)}
          onKeyDown={e => e.key === 'Enter' && handleSave(local)}
          className="input flex-1 bg-gray-900 border-gray-700 text-sm font-mono text-center" 
        />
        <span className="text-gray-400 text-xs font-semibold">% of Net</span>
        <button onClick={() => handleSave(local)} className="btn-secondary px-2 py-1 text-xs whitespace-nowrap">Save</button>
      </div>
      <input 
        type="range" min="0" max="100" step="1" 
        value={local} 
        onChange={e => setLocal(parseInt(e.target.value) || 0)} 
        onMouseUp={() => handleSave(local)}
        onTouchEnd={() => handleSave(local)}
        className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500" 
      />
    </div>
  )
}

function OverflowAllocator({ plan }: { plan: Plan }) {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState('')
  const [percent, setPercent] = useState(10)

  const invs = plan.investment_accounts ?? []
  const givs = plan.giving_targets ?? []

  const invRemainders = invs.filter(a => a.contrib_basis === 'remainder')
  const givRemainders = givs.filter(g => g.basis === 'remainder')
  
  const totalAllocated = invRemainders.reduce((s, a) => s + a.contrib_percent, 0) + givRemainders.reduce((s, g) => s + g.percentage, 0)
  const isOver = totalAllocated > 1.0

  const handleAdd = async () => {
    if (!selectedId) return
    
    // Check if it's an investment
    const inv = invs.find(x => x.id === selectedId)
    if (inv) {
      await updateInvestment(plan.id, inv.id, { ...inv, monthly_contrib: 0, contrib_basis: 'remainder', contrib_percent: percent / 100 })
    } else {
      // Check if it's giving
      const giv = givs.find(x => x.id === selectedId)
      if (giv) {
        await updateGiving(plan.id, giv.id, { ...giv, basis: 'remainder', percentage: percent / 100 })
      }
    }
    qc.invalidateQueries({ queryKey: ['plan', plan.id] })
    qc.invalidateQueries({ queryKey: ['simulate', plan.id] })
    setSelectedId('')
  }

  const handleRemove = async (type: 'inv' | 'giv', id: string) => {
    if (type === 'inv') {
      const inv = invs.find(x => x.id === id)!
      await updateInvestment(plan.id, inv.id, { ...inv, contrib_basis: 'fixed', monthly_contrib: 0, contrib_percent: 0 })
    } else {
      const giv = givs.find(x => x.id === id)!
      await updateGiving(plan.id, giv.id, { ...giv, basis: 'gross', percentage: 0 })
    }
    qc.invalidateQueries({ queryKey: ['plan', plan.id] })
    qc.invalidateQueries({ queryKey: ['simulate', plan.id] })
  }

  // Filter out those already in remainder
  const availInvs = invs.filter(a => a.contrib_basis !== 'remainder')
  const availGivs = givs.filter(g => g.basis !== 'remainder')

  return (
    <div className="mt-6 pt-5 border-t border-gray-800/60">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-gray-300">Overflow Allocation</h4>
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${isOver ? 'bg-red-900/40 text-red-400' : 'bg-gray-800 text-gray-400'}`}>
          Total: {(totalAllocated * 100).toFixed(0)}%
        </span>
      </div>
      
      {/* Visual Stacked Bar */}
      <div className="w-full h-1.5 bg-gray-900 rounded-full overflow-hidden mb-4 flex">
        {invRemainders.map(a => <div key={a.id} style={{ width: `${a.contrib_percent * 100}%` }} className="h-full bg-emerald-500 hover:bg-emerald-400 transition-colors" title={a.name} />)}
        {givRemainders.map(g => <div key={g.id} style={{ width: `${g.percentage * 100}%` }} className="h-full bg-amber-500 hover:bg-amber-400 transition-colors" title={g.name} />)}
      </div>
      
      {invRemainders.length === 0 && givRemainders.length === 0 ? (
        <p className="text-[11px] text-gray-500 mb-4 bg-black/20 p-2 rounded">
          Any remaining cash flow above your ${plan.simulation_config.target_cash_flow.toLocaleString()} target is currently unallocated and will accumulate as raw cash.
        </p>
      ) : (
        <div className="space-y-2 mb-4">
          {invRemainders.map(a => (
            <div key={a.id} className="flex items-center justify-between text-xs bg-gray-900/50 p-2 rounded border border-gray-800">
              <span className="text-gray-300 flex items-center gap-2"><Landmark size={12}/> {a.name}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-emerald-400">{(a.contrib_percent * 100).toFixed(0)}%</span>
                <button onClick={() => handleRemove('inv', a.id)} className="text-gray-600 hover:text-red-400"><X size={12} /></button>
              </div>
            </div>
          ))}
          {givRemainders.map(g => (
            <div key={g.id} className="flex items-center justify-between text-xs bg-gray-900/50 p-2 rounded border border-gray-800">
              <span className="text-gray-300 flex items-center gap-2"><Heart size={12}/> {g.name}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-amber-400">{(g.percentage * 100).toFixed(0)}%</span>
                <button onClick={() => handleRemove('giv', g.id)} className="text-gray-600 hover:text-red-400"><X size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="input text-xs flex-1 bg-gray-900 border-gray-700">
          <option value="">Select target account...</option>
          {availInvs.length > 0 && <optgroup label="Investments & Savings" className="text-gray-500">
            {availInvs.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </optgroup>}
          {availGivs.length > 0 && <optgroup label="Giving Targets" className="text-gray-500">
            {availGivs.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </optgroup>}
        </select>
        <div className="flex items-center justify-between bg-gray-900 rounded border border-gray-700 px-3 w-20">
          <input type="number" min="0" max="100" value={percent} onChange={e => setPercent(parseInt(e.target.value) || 0)} className="bg-transparent border-none focus:ring-0 focus:outline-none p-0 w-8 text-center text-xs text-white [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden" />
          <span className="text-[10px] text-gray-500 font-medium">%</span>
        </div>
        <button onClick={handleAdd} disabled={!selectedId} className="btn-secondary px-3 py-1 text-xs">Add</button>
      </div>
    </div>
  )
}

type ChartView = 'overview' | 'debt' | 'cashflow' | 'savings' | 'table' | 'repayment' | 'comparison'

export default function Dashboard() {
  const qc = useQueryClient()
  const { activePlanId, setActivePlan, setPlans } = usePlanStore()
  const [showCreate, setShowCreate] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
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

  const updateConfigMutation = useMutation({
    mutationFn: (config: Partial<SimulationConfig>) => 
      updatePlan(activePlan_id!, { 
        name: activePlan?.name ?? '', 
        description: activePlan?.description ?? '',
        simulation_config: { ...activePlan!.simulation_config, ...config } 
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan', activePlan_id] })
      qc.invalidateQueries({ queryKey: ['simulate', activePlan_id] })
    }
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
  const hasInvestments = (activePlan?.investment_accounts?.length ?? 0) > 0
  const multiPlan = plans.length > 1

  const totalInterestPaid = snapshots.reduce((s, snap) => s + snap.total_interest_paid, 0)
  const startingPSLFPayments = debtAccounts
    .filter(d => d.pslf_eligible)
    .reduce((max, d) => Math.max(max, d.pslf_payments_made ?? 0), 0)

  const activeYear = lockedYear ?? hoveredYear
  const activeSnap = activeYear ? (findSnapForYear(snapshots, activeYear) ?? firstSnap) : firstSnap
  const isTimeTravel = activeSnap != null && activeSnap !== firstSnap
  const isPastDebtFree = debtFreeSnap != null && activeYear != null && activeYear > debtFreeSnap.year

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
      totalDebt:     last.total_debt,
      totalInvestments: last.total_investments,
      netWorth:      last.net_worth,
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
  const validView = chartViews.some(v => v.key === chartView) ? chartView : 'overview'
  const comparePlan = plans.find(p => p.id === comparePlanId)
  const activePlanForks = plans.filter(p => p.parent_plan_id === activePlan_id)

  return (
    <div className="p-4 lg:p-6 max-w-[1500px] mx-auto space-y-5">
      {showWizard && activePlan_id && (
        <PlanBuilderWizard planId={activePlan_id} onClose={() => setShowWizard(false)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            Dashboard
            {activePlan?.created_by_ai && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">AI Fork</span>}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Your financial sandbox</p>
        </div>
        <div className="flex items-center gap-2">
          {simFetching && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500 mr-2">
              <RefreshCw size={12} className="animate-spin" /> Simulating…
            </span>
          )}
          <button 
            onClick={() => setShowWizard(true)}
            className="btn-ghost flex items-center gap-2 text-blue-400 border border-blue-400/20 hover:bg-blue-400/10"
          >
            <Sparkles size={15} /> Guided Builder
          </button>
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
            Create your first financial plan to start modeling your future.
          </p>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Create your first plan
          </button>
        </div>
      ) : (
        <>
          {/* Plan Navigation & Scenarios */}
          <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1 border-b border-gray-800 scrollbar-hide">
              {plans.filter(p => !p.parent_plan_id).map(plan => (
                <button
                  key={plan.id}
                  onClick={() => setActivePlan(plan.id)}
                  className={`flex-shrink-0 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                    plan.id === activePlan_id || activePlan?.parent_plan_id === plan.id
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {plan.name}
                </button>
              ))}
            </div>

            {(activePlan?.parent_plan_id || activePlanForks.length > 0) && (
              <div className="flex items-center gap-3 py-1">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-600 uppercase tracking-widest bg-gray-900 px-2 py-1 rounded">
                  <GitBranch size={10} /> Scenarios
                </div>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {activePlan?.parent_plan_id && (
                    <button
                      onClick={() => setActivePlan(activePlan.parent_plan_id!)}
                      className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full bg-gray-800 text-gray-400 hover:text-white transition-colors flex items-center gap-1.5"
                    >
                      <span className="opacity-50">Parent:</span> {plans.find(p => p.id === activePlan.parent_plan_id)?.name}
                    </button>
                  )}
                  {activePlanForks.map(fork => (
                    <button
                      key={fork.id}
                      onClick={() => setActivePlan(fork.id)}
                      className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1.5 border ${
                        fork.id === activePlan_id
                          ? 'bg-blue-900/40 border-blue-700 text-blue-300'
                          : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {fork.created_by_ai && <Sparkles size={10} className="text-blue-400" />}
                      {fork.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {activePlan && (
            <>
              {/* Time-travel context bar */}
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
                          <button onClick={() => setLockedYear(null)} className="text-gray-600 hover:text-red-400 transition-colors">
                            <X size={12} />
                          </button>
                        </>
                      )}
                      <button onClick={() => { setLockedYear(null); setHoveredYear(null) }} className="text-[10px] text-gray-600 hover:text-gray-400 ml-auto">
                        ← Back to now
                      </button>
                    </>
                  ) : (
                    <span className="text-[10px] text-gray-600">
                      Hover the overview chart to explore any year · click to lock
                    </span>
                  )}
                </div>
              )}

              {/* Stat strip */}
              {firstSnap && (
                <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 transition-all ${isTimeTravel ? 'ring-1 ring-gray-700/50 rounded-xl p-1 -m-1' : ''}`}>
                  <StatCard
                    label={isTimeTravel ? `Annual Net Income (${activeYear})` : 'Monthly Net Income'}
                    value={isTimeTravel ? fmt(annualForYear?.netIncome) : fmt(firstSnap.net_income)}
                    sub={isTimeTravel ? `Gross: ${fmt(annualForYear?.grossIncome)}` : `Gross: ${fmt(firstSnap.gross_income)}/mo`}
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
                    sub={isTimeTravel ? `Interest: ${fmt(annualForYear?.interestPaid)}/yr` : `Interest: ${fmt(firstSnap.total_interest_paid)}/mo`}
                    icon={<CreditCard size={14} />}
                    accent="orange"
                    dimmed={isPastDebtFree && (annualForYear?.debtPayments ?? 0) === 0}
                  />
                  <StatCard
                    label="Debt-Free Date"
                    value={debtFreeSnap ? calLabel(debtFreeSnap.calendar_month, debtFreeSnap.year) : (hasDebts ? 'Not in 30yr' : 'No debt')}
                    sub={debtFreeSnap ? `Total interest: ${fmtShort(totalInterestPaid)}` : undefined}
                    icon={<Calendar size={14} />}
                    accent={debtFreeSnap ? 'green' : (hasDebts ? 'red' : 'default')}
                    dimmed={isTimeTravel}
                  />
                  {hasPSLF ? (
                    <StatCard
                      label={isTimeTravel ? `PSLF Progress (${activeYear})` : 'PSLF Progress'}
                      value={isTimeTravel ? `${annualForYear?.pslfCount ?? startingPSLFPayments}/120` : `${startingPSLFPayments}/120`}
                      sub={isTimeTravel && (annualForYear?.pslfCount ?? 0) >= 120 ? '✓ Forgiven' : pslfSnap ? `Forgiveness: ${calLabel(pslfSnap.calendar_month, pslfSnap.year)}` : 'No forgiveness'}
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
                  <StatCard
                    label={isTimeTravel ? `Investments (${activeYear})` : 'Investments (30yr)'}
                    value={isTimeTravel ? fmtShort(annualForYear?.totalInvestments) : fmtShort(lastSnap?.total_investments)}
                    sub={`Net worth: ${fmtShort(isTimeTravel ? annualForYear?.netWorth : lastSnap?.net_worth)}`}
                    icon={<Landmark size={14} />}
                    accent="green"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className="lg:col-span-8 space-y-5">
                  {/* Chart section */}
                  <div className="card">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <div className="flex gap-1 flex-wrap">
                        {chartViews.map(v => (
                          <button key={v.key} onClick={() => setChartView(v.key)} className={`px-3 py-1 text-xs rounded-md transition-colors ${validView === v.key ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                            {v.label}
                          </button>
                        ))}
                      </div>
                      <Link to={`/plans/${activePlan.id}/chat`} className="btn-ghost text-xs flex items-center gap-1.5 shrink-0">
                        <MessageSquare size={12} /> Advanced AI
                      </Link>
                    </div>

                    {!simResult ? (
                      <div className="h-72 flex items-center justify-center text-gray-600 text-sm">Add data to simulate</div>
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
                        {validView === 'debt' && <DebtTrajectoryChart snapshots={snapshots} debts={activePlan.debt_accounts} height={300} />}
                        {validView === 'cashflow' && <CashFlowEvolution snapshots={snapshots} />}
                        {validView === 'savings' && <SavingsBreakdownChart snapshots={snapshots} accounts={activePlan.investment_accounts ?? []} height={300} />}
                        {validView === 'table' && <AnnualSummaryTable snapshots={snapshots} />}
                        {validView === 'repayment' && (repaymentData ? <RepaymentComparisonPanel plans={repaymentData.plans} startYear={activePlan.simulation_config.start_year} startMonth={activePlan.simulation_config.start_month} /> : <div className="h-48 flex items-center justify-center text-gray-600 text-sm">Loading…</div>)}
                        {validView === 'comparison' && (
                          <div className="space-y-3">
                            <select value={comparePlanId ?? ''} onChange={e => setComparePlanId(e.target.value || null)} className="input text-xs w-full">
                              <option value="">— select a plan —</option>
                              {plans.filter(p => p.id !== activePlan_id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            {comparePlanId && comparisonData ? <ComparisonPanel deltas={comparisonData.full_deltas} planAName={activePlan.name} planBName={comparePlan?.name ?? 'Plan B'} /> : <div className="h-48 flex items-center justify-center text-gray-600 text-sm">Select a plan</div>}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Cash Flow Constrainer */}
                  <div className="card border-blue-900/20 bg-blue-900/5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={18} className="text-blue-400" />
                        <h3 className="font-semibold text-white text-sm">Cash Flow Constrainer</h3>
                      </div>
                      <button onClick={() => setShowConfig(!showConfig)} className="text-gray-500 hover:text-white">
                        <Settings2 size={16} />
                      </button>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">Cash Flow Ceiling / Sweep Threshold</span>
                        <span className="text-xs font-mono text-white bg-gray-900 px-2 py-1 rounded">
                          {activePlan.simulation_config.target_cash_flow > 1.0 
                            ? fmt(activePlan.simulation_config.target_cash_flow) 
                            : `${(activePlan.simulation_config.target_cash_flow * 100).toFixed(0)}% of Net`}
                        </span>
                      </div>

                      {showConfig && (
                        <TargetCashFlowInput 
                          value={activePlan.simulation_config.target_cash_flow} 
                          onChange={(v) => updateConfigMutation.mutate({ target_cash_flow: v })} 
                        />
                      )}
                      <p className="text-[11px] text-gray-500 leading-relaxed bg-black/20 p-2 rounded border border-gray-800/50">
                        Raw cash accumulation will be capped at this threshold. Any monthly cash flow generated above this ceiling will be swept precisely according to your overflow allocations below.
                      </p>

                      <OverflowAllocator plan={activePlan} />
                    </div>
                  </div>

                  <SimpleAgent planId={activePlan.id} />
                  {simResult && <SensitivityPanel planId={activePlan.id} simParams={{ filing_status: 'mfj', household_size: 2 }} onResult={snaps => { setWhatIfSnapshots(snaps); if (snaps && validView !== 'overview') setChartView('overview') }} />}
                </div>

                <div className="lg:col-span-4 space-y-5">
                  {simResult && hasDebts && <DebtFreedomPanel snapshots={snapshots} plan={activePlan} />}
                  {simResult?.goal_progress?.length ? <GoalsPanel goals={simResult.goal_progress} startYear={activePlan.simulation_config.start_year} startMonth={activePlan.simulation_config.start_month} /> : null}
                  <div className="card flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="font-semibold text-white text-sm">Plan Elements</h2>
                    </div>
                    <div className="flex gap-0.5 border-b border-gray-800 overflow-x-auto py-1 mb-3 scrollbar-hide">
                      {tabs.map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${tab === t.key ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
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
