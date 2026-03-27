import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getPlan } from '../api/client'
import type { Plan } from '../api/types'
import { DollarSign, CreditCard, Landmark, CalendarRange, Heart } from 'lucide-react'

type Tab = 'income' | 'expenses' | 'debts' | 'investments' | 'events' | 'giving'

export default function PlanEditor() {
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<Tab>('income')

  const { data: plan, isLoading } = useQuery({
    queryKey: ['plan', id],
    queryFn: () => getPlan(id!),
    enabled: !!id,
  })

  if (isLoading) return <div className="p-6 text-gray-500">Loading plan...</div>
  if (!plan) return <div className="p-6 text-red-400">Plan not found</div>

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'income',      label: 'Income',      icon: <DollarSign size={15} /> },
    { key: 'expenses',    label: 'Expenses',    icon: <CreditCard size={15} /> },
    { key: 'debts',       label: 'Debt',        icon: <CreditCard size={15} /> },
    { key: 'investments', label: 'Investments', icon: <Landmark size={15} /> },
    { key: 'events',      label: 'Life Events', icon: <CalendarRange size={15} /> },
    { key: 'giving',      label: 'Giving',      icon: <Heart size={15} /> },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">{plan.name}</h1>
        {plan.description && <p className="text-gray-500 text-sm mt-0.5">{plan.description}</p>}
        {plan.parent_plan_id && (
          <span className="inline-flex items-center gap-1.5 text-xs text-amber-400 bg-amber-900/20 border border-amber-800/30 rounded-full px-2.5 py-0.5 mt-2">
            {plan.created_by_ai && '✨ '}Forked plan
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-800 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <TabContent tab={tab} plan={plan} />
    </div>
  )
}

function TabContent({ tab, plan }: { tab: Tab; plan: Plan }) {
  switch (tab) {
    case 'income':      return <IncomeTab plan={plan} />
    case 'expenses':    return <ExpensesTab plan={plan} />
    case 'debts':       return <DebtsTab plan={plan} />
    case 'investments': return <InvestmentsTab plan={plan} />
    case 'events':      return <EventsTab plan={plan} />
    case 'giving':      return <GivingTab plan={plan} />
  }
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-gray-600 text-sm py-8 text-center">{message}</p>
}

function IncomeTab({ plan }: { plan: Plan }) {
  const streams = plan.income_streams ?? []
  return (
    <div className="space-y-3">
      {streams.length === 0 ? <EmptyState message="No income streams yet. Add your residency salary to get started." /> : (
        streams.map(s => (
          <div key={s.id} className="card flex items-center justify-between">
            <div>
              <p className="font-medium text-white">{s.name}</p>
              <p className="text-sm text-gray-500">{s.type} · {s.tax_category} · starts month {s.start_month}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-emerald-400">{fmt(s.amount)}<span className="text-gray-500 text-xs">/mo</span></p>
              {s.growth_rate > 0 && <p className="text-xs text-gray-600">+{(s.growth_rate * 100).toFixed(1)}%/yr</p>}
            </div>
          </div>
        ))
      )}
      <button className="btn-secondary w-full text-sm">+ Add income stream</button>
    </div>
  )
}

function ExpensesTab({ plan }: { plan: Plan }) {
  const expenses = plan.expenses ?? []
  return (
    <div className="space-y-3">
      {expenses.length === 0 ? <EmptyState message="No expenses yet." /> : (
        expenses.map(e => (
          <div key={e.id} className="card flex items-center justify-between">
            <div>
              <p className="font-medium text-white">{e.name}</p>
              <p className="text-sm text-gray-500">{e.category} · starts month {e.start_month}</p>
            </div>
            <p className="font-semibold text-red-400">{fmt(e.monthly_amount)}<span className="text-gray-500 text-xs">/mo</span></p>
          </div>
        ))
      )}
      <button className="btn-secondary w-full text-sm">+ Add expense</button>
    </div>
  )
}

function DebtsTab({ plan }: { plan: Plan }) {
  const debts = plan.debt_accounts ?? []
  return (
    <div className="space-y-3">
      {debts.length === 0 ? <EmptyState message="No debt accounts yet." /> : (
        debts.map(d => (
          <div key={d.id} className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium text-white">{d.name}</p>
              <p className="font-semibold text-red-400">{fmt(d.balance)}</p>
            </div>
            <div className="flex gap-4 text-sm text-gray-500">
              <span>{(d.interest_rate * 100).toFixed(2)}% APR</span>
              <span>{d.repayment_plan.toUpperCase()}</span>
              {d.pslf_eligible && <span className="text-blue-400">PSLF eligible · {d.pslf_payments_made}/120</span>}
            </div>
          </div>
        ))
      )}
      <button className="btn-secondary w-full text-sm">+ Add debt</button>
    </div>
  )
}

function InvestmentsTab({ plan }: { plan: Plan }) {
  const accounts = plan.investment_accounts ?? []
  return (
    <div className="space-y-3">
      {accounts.length === 0 ? <EmptyState message="No investment accounts yet." /> : (
        accounts.map(inv => (
          <div key={inv.id} className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium text-white">{inv.name}</p>
              <p className="font-semibold text-emerald-400">{fmt(inv.balance)}</p>
            </div>
            <div className="flex gap-4 text-sm text-gray-500">
              <span>{inv.type.replace(/_/g, ' ').toUpperCase()}</span>
              <span>{fmt(inv.monthly_contrib)}/mo</span>
              <span>{Math.round(inv.asset_allocation.stock_pct * 100)}% stock / {Math.round(inv.asset_allocation.bond_pct * 100)}% bond</span>
            </div>
          </div>
        ))
      )}
      <button className="btn-secondary w-full text-sm">+ Add account</button>
    </div>
  )
}

function EventsTab({ plan }: { plan: Plan }) {
  const events = (plan.life_events ?? []).sort((a, b) => a.month - b.month)
  return (
    <div className="space-y-3">
      {events.length === 0 ? <EmptyState message="No life events yet. Add your attending start date, major purchases, etc." /> : (
        <div className="relative pl-6 border-l border-gray-800 space-y-4">
          {events.map(ev => (
            <div key={ev.id} className="relative">
              <div className="absolute -left-7 w-3 h-3 rounded-full bg-blue-500 border-2 border-gray-950 mt-1" />
              <p className="font-medium text-white">{ev.name}</p>
              <p className="text-sm text-gray-500">Month {ev.month} · {ev.type.replace(/_/g, ' ')} · {ev.impacts.length} impact{ev.impacts.length !== 1 ? 's' : ''}</p>
            </div>
          ))}
        </div>
      )}
      <button className="btn-secondary w-full text-sm">+ Add life event</button>
    </div>
  )
}

function GivingTab({ plan }: { plan: Plan }) {
  const giving = plan.giving_targets ?? []
  return (
    <div className="space-y-3">
      {giving.length === 0 ? <EmptyState message="No giving targets yet." /> : (
        giving.map(g => (
          <div key={g.id} className="card flex items-center justify-between">
            <div>
              <p className="font-medium text-white">{g.name}</p>
              <p className="text-sm text-gray-500">{g.basis} income · starts month {g.start_month}</p>
            </div>
            <p className="font-semibold text-amber-400">{(g.percentage * 100).toFixed(0)}%</p>
          </div>
        ))
      )}
      <button className="btn-secondary w-full text-sm">+ Add giving target</button>
    </div>
  )
}
