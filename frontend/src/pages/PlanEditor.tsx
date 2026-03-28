import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPlan, forkPlan } from '../api/client'
import type { Plan } from '../api/types'
import {
  DollarSign, CreditCard, Landmark, CalendarRange, Heart,
  GitBranch, MessageSquare,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import Modal from '../components/Modal'
import {
  IncomeTab, ExpensesTab, DebtsTab,
  InvestmentsTab, EventsTab, GivingTab,
  Field, Str, Num, SaveCancel,
} from '../components/forms/PlanComponents'

type Tab = 'income' | 'expenses' | 'debts' | 'investments' | 'events' | 'giving'

// ============================================================
// Fork Modal
// ============================================================

function ForkModal({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const qc = useQueryClient()
  const [forkMonth, setForkMonth] = useState(plan.fork_month ?? 0)
  const [name, setName] = useState(`${plan.name} (fork)`)
  const [desc, setDesc] = useState('')

  const mut = useMutation({
    mutationFn: () => forkPlan(plan.id, forkMonth, name, desc),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plans'] }); onClose() },
  })

  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate() }} className="space-y-4">
      <Field label="Fork Name"><Str value={name} onChange={setName} placeholder="What-if scenario" /></Field>
      <Field label="Description (optional)"><Str value={desc} onChange={setDesc} placeholder="e.g. Aggressive PSLF payoff" /></Field>
      <Field label="Fork at Month">
        <Num value={forkMonth} onChange={setForkMonth} placeholder="0" min={0} />
        <p className="text-xs text-gray-600 mt-1">Month 0 = plan start. The fork diverges from the base plan at this month.</p>
      </Field>
      <SaveCancel onCancel={onClose} isPending={mut.isPending} />
    </form>
  )
}

// ============================================================
// Page
// ============================================================

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

export default function PlanEditor() {
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<Tab>('income')
  const [forkOpen, setForkOpen] = useState(false)

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{plan.name}</h1>
          {plan.description && <p className="text-gray-500 text-sm mt-0.5">{plan.description}</p>}
          {plan.parent_plan_id && (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-400 bg-amber-900/20 border border-amber-800/30 rounded-full px-2.5 py-0.5 mt-2">
              {plan.created_by_ai && '✨ '}Forked plan
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link to={`/plans/${plan.id}/chat`} className="btn-ghost flex items-center gap-2">
            <MessageSquare size={14} /> Ask AI
          </Link>
          <button onClick={() => setForkOpen(true)} className="btn-secondary flex items-center gap-2">
            <GitBranch size={14} /> Fork plan
          </button>
        </div>
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

      {forkOpen && (
        <Modal title="Fork Plan" onClose={() => setForkOpen(false)}>
          <ForkModal plan={plan} onClose={() => setForkOpen(false)} />
        </Modal>
      )}
    </div>
  )
}
