import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getPlan,
  createIncome, deleteIncome,
  createExpense, deleteExpense,
  createDebt, deleteDebt,
  createInvestment, deleteInvestment,
  createEvent, deleteEvent,
  createGiving, deleteGiving,
  forkPlan,
} from '../api/client'
import type {
  Plan, IncomeStream, Expense, DebtAccount,
  InvestmentAccount, LifeEvent, GivingTarget,
  IncomeType, TaxCategory, ExpenseCategory,
  DebtType, RepaymentPlan, AccountType, GivingBasis, EventType,
} from '../api/types'
import {
  DollarSign, CreditCard, Landmark, CalendarRange, Heart,
  Trash2, GitBranch, MessageSquare,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import Modal from '../components/Modal'

type Tab = 'income' | 'expenses' | 'debts' | 'investments' | 'events' | 'giving'

// ---- helpers ----

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-400">{label}</label>
      {children}
    </div>
  )
}

function Select({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="input w-full"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function Num({ value, onChange, placeholder, min, max, step }: {
  value: number; onChange: (v: number) => void
  placeholder?: string; min?: number; max?: number; step?: number
}) {
  return (
    <input
      type="number"
      className="input w-full"
      value={value || ''}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step ?? 1}
    />
  )
}

function Str({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input type="text" className="input w-full" value={value}
      onChange={e => onChange(e.target.value)} placeholder={placeholder} />
  )
}

function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-blue-500" />
      {label}
    </label>
  )
}

function RowActions({ onDelete, isPending }: { onDelete: () => void; isPending: boolean }) {
  return (
    <button
      onClick={onDelete}
      disabled={isPending}
      className="p-1.5 text-gray-600 hover:text-red-400 transition-colors rounded"
      title="Delete"
    >
      <Trash2 size={14} />
    </button>
  )
}

function SaveCancel({ onCancel, isPending }: { onCancel: () => void; isPending: boolean }) {
  return (
    <div className="flex gap-3 pt-2">
      <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
      <button type="submit" className="btn-primary flex-1" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

// ============================================================
// Income
// ============================================================

function IncomeForm({ planId, onClose }: { planId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [type, setType] = useState<IncomeType>('salary')
  const [taxCat, setTaxCat] = useState<TaxCategory>('w2')
  const [amount, setAmount] = useState(0)
  const [growthRate, setGrowthRate] = useState(0)
  const [startMonth, setStartMonth] = useState(0)
  const [endMonth, setEndMonth] = useState<number | undefined>()

  const mut = useMutation({
    mutationFn: () => createIncome(planId, {
      name, type, tax_category: taxCat,
      amount, growth_rate: growthRate / 100,
      start_month: startMonth,
      end_month: endMonth,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', planId] }); onClose() },
  })

  const incomeTypes: { value: IncomeType; label: string }[] = [
    { value: 'salary', label: 'Salary' },
    { value: 'bonus', label: 'Bonus' },
    { value: 'side_income', label: 'Side Income' },
    { value: 'investment', label: 'Investment' },
    { value: 'rental', label: 'Rental' },
    { value: 'other', label: 'Other' },
  ]
  const taxCats: { value: TaxCategory; label: string }[] = [
    { value: 'w2', label: 'W-2' },
    { value: 'self_employed', label: 'Self-Employed (1099)' },
    { value: 'passive', label: 'Passive' },
    { value: 'capital_gains', label: 'Capital Gains' },
  ]

  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate() }} className="space-y-4">
      <Field label="Name"><Str value={name} onChange={setName} placeholder="e.g. Residency Salary" /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Type"><Select value={type} onChange={v => setType(v as IncomeType)} options={incomeTypes} /></Field>
        <Field label="Tax Category"><Select value={taxCat} onChange={v => setTaxCat(v as TaxCategory)} options={taxCats} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Monthly Amount ($)"><Num value={amount} onChange={setAmount} placeholder="5000" min={0} /></Field>
        <Field label="Annual Growth (%)"><Num value={growthRate} onChange={setGrowthRate} placeholder="3" min={0} max={100} step={0.1} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Start Month"><Num value={startMonth} onChange={setStartMonth} placeholder="0" min={0} /></Field>
        <Field label="End Month (blank = indefinite)">
          <input type="number" className="input w-full" value={endMonth ?? ''}
            onChange={e => setEndMonth(e.target.value ? parseInt(e.target.value) : undefined)}
            placeholder="—" min={0} />
        </Field>
      </div>
      <SaveCancel onCancel={onClose} isPending={mut.isPending} />
    </form>
  )
}

function IncomeTab({ plan }: { plan: Plan }) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const delMut = useMutation({
    mutationFn: (id: string) => deleteIncome(plan.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan', plan.id] }),
  })

  return (
    <div className="space-y-3">
      {(plan.income_streams ?? []).map(s => (
        <div key={s.id} className="card flex items-center justify-between">
          <div>
            <p className="font-medium text-white">{s.name}</p>
            <p className="text-sm text-gray-500">{s.type} · {s.tax_category} · starts month {s.start_month}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-semibold text-emerald-400">{fmt(s.amount)}<span className="text-gray-500 text-xs">/mo</span></p>
              {s.growth_rate > 0 && <p className="text-xs text-gray-600">+{(s.growth_rate * 100).toFixed(1)}%/yr</p>}
            </div>
            <RowActions onDelete={() => delMut.mutate(s.id)} isPending={delMut.isPending} />
          </div>
        </div>
      ))}
      {(plan.income_streams ?? []).length === 0 && (
        <p className="text-gray-600 text-sm py-8 text-center">No income streams yet. Add your residency salary to get started.</p>
      )}
      <button onClick={() => setOpen(true)} className="btn-secondary w-full text-sm">+ Add income stream</button>
      {open && <Modal title="Add Income Stream" onClose={() => setOpen(false)}><IncomeForm planId={plan.id} onClose={() => setOpen(false)} /></Modal>}
    </div>
  )
}

// ============================================================
// Expenses
// ============================================================

function ExpenseForm({ planId, onClose }: { planId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('other')
  const [amount, setAmount] = useState(0)
  const [growthRate, setGrowthRate] = useState(0)
  const [startMonth, setStartMonth] = useState(0)
  const [endMonth, setEndMonth] = useState<number | undefined>()
  const [isOneTime, setIsOneTime] = useState(false)

  const mut = useMutation({
    mutationFn: () => createExpense(planId, {
      name, category, monthly_amount: amount,
      growth_rate: growthRate / 100,
      start_month: startMonth, end_month: endMonth, is_one_time: isOneTime,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', planId] }); onClose() },
  })

  const cats: { value: ExpenseCategory; label: string }[] = [
    { value: 'housing', label: 'Housing' },
    { value: 'food', label: 'Food' },
    { value: 'transport', label: 'Transport' },
    { value: 'healthcare', label: 'Healthcare' },
    { value: 'insurance', label: 'Insurance' },
    { value: 'childcare', label: 'Childcare' },
    { value: 'education', label: 'Education' },
    { value: 'subscription', label: 'Subscription' },
    { value: 'utilities', label: 'Utilities' },
    { value: 'personal', label: 'Personal' },
    { value: 'travel', label: 'Travel' },
    { value: 'other', label: 'Other' },
  ]

  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate() }} className="space-y-4">
      <Field label="Name"><Str value={name} onChange={setName} placeholder="e.g. Rent" /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Category"><Select value={category} onChange={v => setCategory(v as ExpenseCategory)} options={cats} /></Field>
        <Field label="Monthly Amount ($)"><Num value={amount} onChange={setAmount} placeholder="1500" min={0} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Annual Growth (%)"><Num value={growthRate} onChange={setGrowthRate} placeholder="3" min={0} step={0.1} /></Field>
        <Field label="Start Month"><Num value={startMonth} onChange={setStartMonth} placeholder="0" min={0} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="End Month (blank = indefinite)">
          <input type="number" className="input w-full" value={endMonth ?? ''}
            onChange={e => setEndMonth(e.target.value ? parseInt(e.target.value) : undefined)}
            placeholder="—" min={0} />
        </Field>
        <Field label="&nbsp;">
          <div className="pt-2"><Check label="One-time expense" value={isOneTime} onChange={setIsOneTime} /></div>
        </Field>
      </div>
      <SaveCancel onCancel={onClose} isPending={mut.isPending} />
    </form>
  )
}

function ExpensesTab({ plan }: { plan: Plan }) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const delMut = useMutation({
    mutationFn: (id: string) => deleteExpense(plan.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan', plan.id] }),
  })

  return (
    <div className="space-y-3">
      {(plan.expenses ?? []).map(e => (
        <div key={e.id} className="card flex items-center justify-between">
          <div>
            <p className="font-medium text-white">{e.name}</p>
            <p className="text-sm text-gray-500">{e.category} · starts month {e.start_month}{e.is_one_time ? ' · one-time' : ''}</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="font-semibold text-red-400">{fmt(e.monthly_amount)}<span className="text-gray-500 text-xs">/mo</span></p>
            <RowActions onDelete={() => delMut.mutate(e.id)} isPending={delMut.isPending} />
          </div>
        </div>
      ))}
      {(plan.expenses ?? []).length === 0 && (
        <p className="text-gray-600 text-sm py-8 text-center">No expenses yet.</p>
      )}
      <button onClick={() => setOpen(true)} className="btn-secondary w-full text-sm">+ Add expense</button>
      {open && <Modal title="Add Expense" onClose={() => setOpen(false)}><ExpenseForm planId={plan.id} onClose={() => setOpen(false)} /></Modal>}
    </div>
  )
}

// ============================================================
// Debts
// ============================================================

function DebtForm({ planId, onClose }: { planId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [type, setType] = useState<DebtType>('student_loan')
  const [principal, setPrincipal] = useState(0)
  const [balance, setBalance] = useState(0)
  const [rate, setRate] = useState(0)
  const [minPayment, setMinPayment] = useState(0)
  const [extraPayment, setExtraPayment] = useState(0)
  const [startMonth, setStartMonth] = useState(0)
  const [repayment, setRepayment] = useState<RepaymentPlan>('standard')
  const [pslfEligible, setPslfEligible] = useState(false)
  const [pslfPayments, setPslfPayments] = useState(0)

  const mut = useMutation({
    mutationFn: () => createDebt(planId, {
      name, type,
      original_principal: principal,
      balance: balance || principal,
      interest_rate: rate / 100,
      min_payment: minPayment,
      extra_payment: extraPayment,
      start_month: startMonth,
      repayment_plan: repayment,
      pslf_eligible: pslfEligible,
      pslf_payments_made: pslfPayments,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', planId] }); onClose() },
  })

  const debtTypes: { value: DebtType; label: string }[] = [
    { value: 'student_loan', label: 'Student Loan' },
    { value: 'mortgage', label: 'Mortgage' },
    { value: 'auto', label: 'Auto Loan' },
    { value: 'credit_card', label: 'Credit Card' },
    { value: 'personal', label: 'Personal Loan' },
    { value: 'other', label: 'Other' },
  ]
  const repaymentPlans: { value: RepaymentPlan; label: string }[] = [
    { value: 'standard', label: 'Standard (10yr)' },
    { value: 'idr', label: 'IDR (Income-Driven)' },
    { value: 'paye', label: 'PAYE' },
    { value: 'save', label: 'SAVE' },
  ]

  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate() }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name"><Str value={name} onChange={setName} placeholder="e.g. Med School Loans" /></Field>
        <Field label="Type"><Select value={type} onChange={v => setType(v as DebtType)} options={debtTypes} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Original Principal ($)"><Num value={principal} onChange={setPrincipal} placeholder="200000" min={0} /></Field>
        <Field label="Current Balance ($)"><Num value={balance} onChange={setBalance} placeholder="same as principal" min={0} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Interest Rate (%)"><Num value={rate} onChange={setRate} placeholder="6.5" min={0} max={100} step={0.01} /></Field>
        <Field label="Repayment Plan"><Select value={repayment} onChange={v => setRepayment(v as RepaymentPlan)} options={repaymentPlans} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Min Payment ($/mo)"><Num value={minPayment} onChange={setMinPayment} placeholder="auto-calc" min={0} /></Field>
        <Field label="Extra Payment ($/mo)"><Num value={extraPayment} onChange={setExtraPayment} placeholder="0" min={0} /></Field>
      </div>
      <Field label="Start Month"><Num value={startMonth} onChange={setStartMonth} placeholder="0" min={0} /></Field>
      <div className="space-y-3 pt-1">
        <Check label="PSLF Eligible" value={pslfEligible} onChange={setPslfEligible} />
        {pslfEligible && (
          <Field label="PSLF Qualifying Payments Already Made">
            <Num value={pslfPayments} onChange={setPslfPayments} placeholder="0" min={0} max={120} />
          </Field>
        )}
      </div>
      <SaveCancel onCancel={onClose} isPending={mut.isPending} />
    </form>
  )
}

function DebtsTab({ plan }: { plan: Plan }) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const delMut = useMutation({
    mutationFn: (id: string) => deleteDebt(plan.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan', plan.id] }),
  })

  return (
    <div className="space-y-3">
      {(plan.debt_accounts ?? []).map(d => (
        <div key={d.id} className="card">
          <div className="flex items-center justify-between mb-2">
            <p className="font-medium text-white">{d.name}</p>
            <div className="flex items-center gap-3">
              <p className="font-semibold text-red-400">{fmt(d.balance)}</p>
              <RowActions onDelete={() => delMut.mutate(d.id)} isPending={delMut.isPending} />
            </div>
          </div>
          <div className="flex gap-4 text-sm text-gray-500">
            <span>{(d.interest_rate * 100).toFixed(2)}% APR</span>
            <span>{d.repayment_plan.toUpperCase()}</span>
            {d.pslf_eligible && <span className="text-blue-400">PSLF eligible · {d.pslf_payments_made}/120</span>}
          </div>
        </div>
      ))}
      {(plan.debt_accounts ?? []).length === 0 && (
        <p className="text-gray-600 text-sm py-8 text-center">No debt accounts yet.</p>
      )}
      <button onClick={() => setOpen(true)} className="btn-secondary w-full text-sm">+ Add debt</button>
      {open && <Modal title="Add Debt Account" onClose={() => setOpen(false)}><DebtForm planId={plan.id} onClose={() => setOpen(false)} /></Modal>}
    </div>
  )
}

// ============================================================
// Investments
// ============================================================

function InvestmentForm({ planId, onClose }: { planId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('trad_401k')
  const [balance, setBalance] = useState(0)
  const [contrib, setContrib] = useState(0)
  const [match, setMatch] = useState(0)
  const [matchCap, setMatchCap] = useState(0)
  const [stockPct, setStockPct] = useState(90)
  const [bondPct, setBondPct] = useState(10)
  const [startMonth, setStartMonth] = useState(0)

  const mut = useMutation({
    mutationFn: () => createInvestment(planId, {
      name, type, balance,
      monthly_contrib: contrib,
      employer_match: match / 100,
      employer_match_cap: matchCap / 100,
      asset_allocation: {
        stock_pct: stockPct / 100,
        bond_pct: bondPct / 100,
        cash_pct: Math.max(0, 1 - stockPct / 100 - bondPct / 100),
      },
      start_month: startMonth,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', planId] }); onClose() },
  })

  const accountTypes: { value: AccountType; label: string }[] = [
    { value: 'trad_401k', label: 'Traditional 401(k)' },
    { value: 'roth_401k', label: 'Roth 401(k)' },
    { value: 'trad_457b', label: '457(b)' },
    { value: 'trad_ira', label: 'Traditional IRA' },
    { value: 'roth_ira', label: 'Roth IRA' },
    { value: 'hsa', label: 'HSA' },
    { value: 'taxable', label: 'Taxable Brokerage' },
    { value: '529', label: '529 (Education)' },
    { value: 'cash', label: 'Cash / Savings' },
  ]

  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate() }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name"><Str value={name} onChange={setName} placeholder="e.g. Hospital 401k" /></Field>
        <Field label="Account Type"><Select value={type} onChange={v => setType(v as AccountType)} options={accountTypes} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Current Balance ($)"><Num value={balance} onChange={setBalance} placeholder="0" min={0} /></Field>
        <Field label="Monthly Contribution ($)"><Num value={contrib} onChange={setContrib} placeholder="500" min={0} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Employer Match (%)"><Num value={match} onChange={setMatch} placeholder="0" min={0} max={100} step={0.5} /></Field>
        <Field label="Match Cap (% of salary)"><Num value={matchCap} onChange={setMatchCap} placeholder="0" min={0} max={100} step={0.5} /></Field>
      </div>
      <div>
        <p className="text-xs font-medium text-gray-400 mb-2">Asset Allocation</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Stock %"><Num value={stockPct} onChange={setStockPct} placeholder="90" min={0} max={100} /></Field>
          <Field label="Bond %"><Num value={bondPct} onChange={setBondPct} placeholder="10" min={0} max={100} /></Field>
        </div>
        <p className="text-xs text-gray-600 mt-1">Cash: {Math.max(0, 100 - stockPct - bondPct)}%</p>
      </div>
      <Field label="Start Month"><Num value={startMonth} onChange={setStartMonth} placeholder="0" min={0} /></Field>
      <SaveCancel onCancel={onClose} isPending={mut.isPending} />
    </form>
  )
}

function InvestmentsTab({ plan }: { plan: Plan }) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const delMut = useMutation({
    mutationFn: (id: string) => deleteInvestment(plan.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan', plan.id] }),
  })

  return (
    <div className="space-y-3">
      {(plan.investment_accounts ?? []).map(inv => (
        <div key={inv.id} className="card">
          <div className="flex items-center justify-between mb-2">
            <p className="font-medium text-white">{inv.name}</p>
            <div className="flex items-center gap-3">
              <p className="font-semibold text-emerald-400">{fmt(inv.balance)}</p>
              <RowActions onDelete={() => delMut.mutate(inv.id)} isPending={delMut.isPending} />
            </div>
          </div>
          <div className="flex gap-4 text-sm text-gray-500">
            <span>{inv.type.replace(/_/g, ' ').toUpperCase()}</span>
            <span>{fmt(inv.monthly_contrib)}/mo</span>
            <span>{Math.round(inv.asset_allocation.stock_pct * 100)}% stock / {Math.round(inv.asset_allocation.bond_pct * 100)}% bond</span>
          </div>
        </div>
      ))}
      {(plan.investment_accounts ?? []).length === 0 && (
        <p className="text-gray-600 text-sm py-8 text-center">No investment accounts yet.</p>
      )}
      <button onClick={() => setOpen(true)} className="btn-secondary w-full text-sm">+ Add account</button>
      {open && <Modal title="Add Investment Account" onClose={() => setOpen(false)}><InvestmentForm planId={plan.id} onClose={() => setOpen(false)} /></Modal>}
    </div>
  )
}

// ============================================================
// Life Events
// ============================================================

function EventForm({ planId, onClose }: { planId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [type, setType] = useState<EventType>('milestone')
  const [month, setMonth] = useState(0)

  const mut = useMutation({
    mutationFn: () => createEvent(planId, { name, type, month, impacts: [] }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', planId] }); onClose() },
  })

  const eventTypes: { value: EventType; label: string }[] = [
    { value: 'milestone', label: 'Milestone' },
    { value: 'income_change', label: 'Income Change' },
    { value: 'expense_change', label: 'Expense Change' },
    { value: 'one_time_expense', label: 'One-Time Expense' },
    { value: 'debt_payoff', label: 'Debt Payoff' },
  ]

  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate() }} className="space-y-4">
      <Field label="Event Name"><Str value={name} onChange={setName} placeholder="e.g. Start Attending" /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Type"><Select value={type} onChange={v => setType(v as EventType)} options={eventTypes} /></Field>
        <Field label="Month (from plan start)"><Num value={month} onChange={setMonth} placeholder="0" min={0} /></Field>
      </div>
      <p className="text-xs text-gray-600">Impacts (income/expense changes triggered by this event) can be added later via the AI agent or by editing the plan directly.</p>
      <SaveCancel onCancel={onClose} isPending={mut.isPending} />
    </form>
  )
}

function EventsTab({ plan }: { plan: Plan }) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const delMut = useMutation({
    mutationFn: (id: string) => deleteEvent(plan.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan', plan.id] }),
  })
  const events = (plan.life_events ?? []).sort((a, b) => a.month - b.month)

  return (
    <div className="space-y-3">
      {events.length > 0 && (
        <div className="relative pl-6 border-l border-gray-800 space-y-4">
          {events.map(ev => (
            <div key={ev.id} className="relative flex items-start justify-between gap-4">
              <div className="flex items-start gap-0">
                <div className="absolute -left-7 w-3 h-3 rounded-full bg-blue-500 border-2 border-gray-950 mt-1" />
                <div>
                  <p className="font-medium text-white">{ev.name}</p>
                  <p className="text-sm text-gray-500">Month {ev.month} · {ev.type.replace(/_/g, ' ')} · {ev.impacts.length} impact{ev.impacts.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <RowActions onDelete={() => delMut.mutate(ev.id)} isPending={delMut.isPending} />
            </div>
          ))}
        </div>
      )}
      {events.length === 0 && (
        <p className="text-gray-600 text-sm py-8 text-center">No life events yet. Add your attending start date, major purchases, etc.</p>
      )}
      <button onClick={() => setOpen(true)} className="btn-secondary w-full text-sm">+ Add life event</button>
      {open && <Modal title="Add Life Event" onClose={() => setOpen(false)}><EventForm planId={plan.id} onClose={() => setOpen(false)} /></Modal>}
    </div>
  )
}

// ============================================================
// Giving
// ============================================================

function GivingForm({ planId, onClose }: { planId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [basis, setBasis] = useState<GivingBasis>('gross')
  const [percentage, setPercentage] = useState(10)
  const [startMonth, setStartMonth] = useState(0)

  const mut = useMutation({
    mutationFn: () => createGiving(planId, {
      name, basis, percentage: percentage / 100,
      start_month: startMonth,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', planId] }); onClose() },
  })

  const basisOpts: { value: GivingBasis; label: string }[] = [
    { value: 'gross', label: 'Gross Income' },
    { value: 'net', label: 'Net Income (after tax)' },
  ]

  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate() }} className="space-y-4">
      <Field label="Name"><Str value={name} onChange={setName} placeholder="e.g. Church Tithe" /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Basis"><Select value={basis} onChange={v => setBasis(v as GivingBasis)} options={basisOpts} /></Field>
        <Field label="Percentage (%)"><Num value={percentage} onChange={setPercentage} placeholder="10" min={0} max={100} step={0.5} /></Field>
      </div>
      <Field label="Start Month"><Num value={startMonth} onChange={setStartMonth} placeholder="0" min={0} /></Field>
      <SaveCancel onCancel={onClose} isPending={mut.isPending} />
    </form>
  )
}

function GivingTab({ plan }: { plan: Plan }) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const delMut = useMutation({
    mutationFn: (id: string) => deleteGiving(plan.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan', plan.id] }),
  })

  return (
    <div className="space-y-3">
      {(plan.giving_targets ?? []).map(g => (
        <div key={g.id} className="card flex items-center justify-between">
          <div>
            <p className="font-medium text-white">{g.name}</p>
            <p className="text-sm text-gray-500">{g.basis} income · starts month {g.start_month}</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="font-semibold text-amber-400">{(g.percentage * 100).toFixed(0)}%</p>
            <RowActions onDelete={() => delMut.mutate(g.id)} isPending={delMut.isPending} />
          </div>
        </div>
      ))}
      {(plan.giving_targets ?? []).length === 0 && (
        <p className="text-gray-600 text-sm py-8 text-center">No giving targets yet.</p>
      )}
      <button onClick={() => setOpen(true)} className="btn-secondary w-full text-sm">+ Add giving target</button>
      {open && <Modal title="Add Giving Target" onClose={() => setOpen(false)}><GivingForm planId={plan.id} onClose={() => setOpen(false)} /></Modal>}
    </div>
  )
}

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
