import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createIncome, updateIncome, deleteIncome,
  createExpense, updateExpense, deleteExpense,
  createDebt, updateDebt, deleteDebt,
  createInvestment, updateInvestment, deleteInvestment,
  createEvent, updateEvent, deleteEvent,
  createGiving, updateGiving, deleteGiving,
  estimateSocialSecurity,
} from '../../api/client'
import type {
  Plan, IncomeStream, Expense, DebtAccount,
  InvestmentAccount, LifeEvent, GivingTarget,
  IncomeType, TaxCategory, ExpenseCategory,
  DebtType, RepaymentPlan, AccountType, GivingBasis, ContribBasis, EventType,
} from '../../api/types'
import { Trash2, Edit2, Copy } from 'lucide-react'
import Modal from '../Modal'

// ---- helpers ----

export function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-400">{label}</label>
      {children}
    </div>
  )
}

export function Select({ value, onChange, options }: {
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

export function Num({ value, onChange, placeholder, min, max, step }: {
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

export function Str({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input type="text" className="input w-full" value={value}
      onChange={e => onChange(e.target.value)} placeholder={placeholder} />
  )
}

export function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-blue-500" />
      {label}
    </label>
  )
}

export function RowActions({ onEdit, onCopy, onDelete, isPending }: { 
  onEdit: () => void; 
  onCopy: () => void;
  onDelete: () => void; 
  isPending: boolean 
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onEdit}
        disabled={isPending}
        className="p-1.5 text-gray-600 hover:text-blue-400 transition-colors rounded"
        title="Edit"
      >
        <Edit2 size={14} />
      </button>
      <button
        onClick={onCopy}
        disabled={isPending}
        className="p-1.5 text-gray-600 hover:text-emerald-400 transition-colors rounded"
        title="Copy"
      >
        <Copy size={14} />
      </button>
      <button
        onClick={onDelete}
        disabled={isPending}
        className="p-1.5 text-gray-600 hover:text-red-400 transition-colors rounded"
        title="Delete"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

export function SaveCancel({ onCancel, isPending }: { onCancel: () => void; isPending: boolean }) {
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

export function IncomeForm({ planId, onClose, initialData }: { 
  planId: string; 
  onClose: () => void;
  initialData?: Partial<IncomeStream>;
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(initialData?.name ?? '')
  const [type, setType] = useState<IncomeType>(initialData?.type ?? 'salary')
  const [taxCat, setTaxCat] = useState<TaxCategory>(initialData?.tax_category ?? 'w2')
  const [amount, setAmount] = useState(initialData?.amount ?? 0)
  const [growthRate, setGrowthRate] = useState((initialData?.growth_rate ?? 0) * 100)
  const [startMonth, setStartMonth] = useState(initialData?.start_month ?? 0)
  const [endMonth, setEndMonth] = useState<number | undefined>(initialData?.end_month)

  const mut = useMutation({
    mutationFn: () => {
      const data = {
        name, type, tax_category: taxCat,
        amount, growth_rate: growthRate / 100,
        start_month: startMonth,
        end_month: endMonth,
      }
      if (initialData?.id) {
        return updateIncome(planId, initialData.id, { ...data, id: initialData.id, plan_id: planId })
      }
      return createIncome(planId, data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', planId] }); qc.invalidateQueries({ queryKey: ['simulate', planId] }); onClose() },
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

export function IncomeTab({ plan }: { plan: Plan }) {
  const [modal, setModal] = useState<{ type: 'add' | 'edit' | 'copy'; data?: Partial<IncomeStream> } | null>(null)
  const [ssAge, setSsAge] = useState(27)
  const [ssModal, setSsModal] = useState(false)
  const qc = useQueryClient()
  const delMut = useMutation({
    mutationFn: (id: string) => deleteIncome(plan.id, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', plan.id] }); qc.invalidateQueries({ queryKey: ['simulate', plan.id] }) },
  })
  const ssMut = useMutation({
    mutationFn: async () => {
      const est = await estimateSocialSecurity(plan.id, ssAge, 67)
      return createIncome(plan.id, {
        name: 'Social Security',
        type: 'other',
        tax_category: 'w2',
        amount: Math.round(est.monthly_benefit),
        growth_rate: 0.02,
        start_month: est.retirement_month,
        end_month: undefined,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan', plan.id] })
      qc.invalidateQueries({ queryKey: ['simulate', plan.id] })
      setSsModal(false)
    },
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
            <RowActions 
              onEdit={() => setModal({ type: 'edit', data: s })}
              onCopy={() => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { id, ...rest } = s
                setModal({ type: 'copy', data: rest })
              }}
              onDelete={() => delMut.mutate(s.id)} 
              isPending={delMut.isPending} 
            />
          </div>
        </div>
      ))}
      {(plan.income_streams ?? []).length === 0 && (
        <p className="text-gray-600 text-sm py-8 text-center">No income streams yet. Add your residency salary to get started.</p>
      )}
      <div className="flex gap-2">
        <button onClick={() => setModal({ type: 'add' })} className="btn-secondary flex-1 text-sm">+ Add income stream</button>
        <button
          onClick={() => setSsModal(true)}
          className="btn-secondary text-sm text-purple-400 border-purple-800/40 hover:border-purple-600"
          title="Add Social Security estimate"
        >
          + SS Estimate
        </button>
      </div>
      {modal && (
        <Modal
          title={modal.type === 'edit' ? 'Edit Income Stream' : modal.type === 'copy' ? 'Copy Income Stream' : 'Add Income Stream'}
          onClose={() => setModal(null)}
        >
          <IncomeForm planId={plan.id} onClose={() => setModal(null)} initialData={modal.data} />
        </Modal>
      )}
      {ssModal && (
        <Modal title="Add Social Security Estimate" onClose={() => setSsModal(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Estimates your monthly Social Security benefit based on projected career earnings in this plan.
            </p>
            <Field label="Your Current Age">
              <Num value={ssAge} onChange={setSsAge} placeholder="27" min={18} max={66} />
            </Field>
            <p className="text-xs text-gray-600">Retirement age defaults to 67. The estimated benefit will be added as an income stream starting at your retirement month.</p>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setSsModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                type="button"
                className="btn-primary flex-1"
                disabled={ssMut.isPending}
                onClick={() => ssMut.mutate()}
              >
                {ssMut.isPending ? 'Estimating…' : 'Add SS Income'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ============================================================
// Expenses
// ============================================================

export function ExpenseForm({ planId, onClose, initialData }: { 
  planId: string; 
  onClose: () => void;
  initialData?: Partial<Expense>;
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(initialData?.name ?? '')
  const [category, setCategory] = useState<ExpenseCategory>(initialData?.category ?? 'other')
  const [amount, setAmount] = useState(initialData?.monthly_amount ?? 0)
  const [growthRate, setGrowthRate] = useState((initialData?.growth_rate ?? 0) * 100)
  const [startMonth, setStartMonth] = useState(initialData?.start_month ?? 0)
  const [endMonth, setEndMonth] = useState<number | undefined>(initialData?.end_month)
  const [isOneTime, setIsOneTime] = useState(initialData?.is_one_time ?? false)

  const mut = useMutation({
    mutationFn: () => {
      const data = {
        name, category, monthly_amount: amount,
        growth_rate: growthRate / 100,
        start_month: startMonth, end_month: endMonth, is_one_time: isOneTime,
      }
      if (initialData?.id) {
        return updateExpense(planId, initialData.id, { ...data, id: initialData.id, plan_id: planId })
      }
      return createExpense(planId, data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', planId] }); qc.invalidateQueries({ queryKey: ['simulate', planId] }); onClose() },
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

export function ExpensesTab({ plan }: { plan: Plan }) {
  const [modal, setModal] = useState<{ type: 'add' | 'edit' | 'copy'; data?: Partial<Expense> } | null>(null)
  const qc = useQueryClient()
  const delMut = useMutation({
    mutationFn: (id: string) => deleteExpense(plan.id, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', plan.id] }); qc.invalidateQueries({ queryKey: ['simulate', plan.id] }) },
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
            <RowActions 
              onEdit={() => setModal({ type: 'edit', data: e })}
              onCopy={() => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { id, ...rest } = e
                setModal({ type: 'copy', data: rest })
              }}
              onDelete={() => delMut.mutate(e.id)} 
              isPending={delMut.isPending} 
            />
          </div>
        </div>
      ))}
      {(plan.expenses ?? []).length === 0 && (
        <p className="text-gray-600 text-sm py-8 text-center">No expenses yet.</p>
      )}
      <button onClick={() => setModal({ type: 'add' })} className="btn-secondary w-full text-sm">+ Add expense</button>
      {modal && (
        <Modal 
          title={modal.type === 'edit' ? 'Edit Expense' : modal.type === 'copy' ? 'Copy Expense' : 'Add Expense'} 
          onClose={() => setModal(null)}
        >
          <ExpenseForm planId={plan.id} onClose={() => setModal(null)} initialData={modal.data} />
        </Modal>
      )}
    </div>
  )
}

// ============================================================
// Debts
// ============================================================

export function DebtForm({ planId, onClose, initialData }: { 
  planId: string; 
  onClose: () => void;
  initialData?: Partial<DebtAccount>;
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(initialData?.name ?? '')
  const [type, setType] = useState<DebtType>(initialData?.type ?? 'student_loan')
  const [principal, setPrincipal] = useState(initialData?.original_principal ?? 0)
  const [balance, setBalance] = useState(initialData?.balance ?? 0)
  const [rate, setRate] = useState((initialData?.interest_rate ?? 0) * 100)
  const [minPayment, setMinPayment] = useState(initialData?.min_payment ?? 0)
  const [extraPayment, setExtraPayment] = useState(initialData?.extra_payment ?? 0)
  const [startMonth, setStartMonth] = useState(initialData?.start_month ?? 0)
  const [repayment, setRepayment] = useState<RepaymentPlan>(initialData?.repayment_plan ?? 'standard')
  const [pslfEligible, setPslfEligible] = useState(initialData?.pslf_eligible ?? false)
  const [pslfPayments, setPslfPayments] = useState(initialData?.pslf_payments_made ?? 0)
  const [propertyValue, setPropertyValue] = useState(initialData?.property_value ?? 0)
  const [appreciationRate, setAppreciationRate] = useState((initialData?.appreciation_rate ?? 0.03) * 100)

  const mut = useMutation({
    mutationFn: () => {
      const data = {
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
        property_value: type === 'mortgage' ? propertyValue : 0,
        appreciation_rate: type === 'mortgage' ? appreciationRate / 100 : 0,
      }
      if (initialData?.id) {
        return updateDebt(planId, initialData.id, { ...data, id: initialData.id, plan_id: planId })
      }
      return createDebt(planId, data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', planId] }); qc.invalidateQueries({ queryKey: ['simulate', planId] }); onClose() },
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
    { value: 'paye', label: 'PAYE (10%, capped)' },
    { value: 'save', label: 'SAVE (10%, 225% poverty)' },
    { value: 'ibr_new', label: 'IBR New (10%, no cap)' },
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
      {type === 'mortgage' && (
        <div className="rounded-lg border border-amber-800/30 bg-amber-900/5 p-3 space-y-3">
          <p className="text-xs font-medium text-amber-400">Mortgage Asset Tracking</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Current Property Value ($)">
              <Num value={propertyValue} onChange={setPropertyValue} placeholder="400000" min={0} />
            </Field>
            <Field label="Annual Appreciation (%)">
              <Num value={appreciationRate} onChange={setAppreciationRate} placeholder="3" min={0} max={20} step={0.1} />
            </Field>
          </div>
          <p className="text-[10px] text-gray-600">Home equity will be included in your net worth projection.</p>
        </div>
      )}
      <SaveCancel onCancel={onClose} isPending={mut.isPending} />
    </form>
  )
}

export function DebtsTab({ plan }: { plan: Plan }) {
  const [modal, setModal] = useState<{ type: 'add' | 'edit' | 'copy'; data?: Partial<DebtAccount> } | null>(null)
  const qc = useQueryClient()
  const delMut = useMutation({
    mutationFn: (id: string) => deleteDebt(plan.id, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', plan.id] }); qc.invalidateQueries({ queryKey: ['simulate', plan.id] }) },
  })

  return (
    <div className="space-y-3">
      {(plan.debt_accounts ?? []).map(d => (
        <div key={d.id} className="card">
          <div className="flex items-center justify-between mb-2">
            <p className="font-medium text-white">{d.name}</p>
            <div className="flex items-center gap-3">
              <p className="font-semibold text-red-400">{fmt(d.balance)}</p>
              <RowActions 
                onEdit={() => setModal({ type: 'edit', data: d })}
                onCopy={() => {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { id, ...rest } = d
                  setModal({ type: 'copy', data: rest })
                }}
                onDelete={() => delMut.mutate(d.id)} 
                isPending={delMut.isPending} 
              />
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
      <button onClick={() => setModal({ type: 'add' })} className="btn-secondary w-full text-sm">+ Add debt</button>
      {modal && (
        <Modal 
          title={modal.type === 'edit' ? 'Edit Debt Account' : modal.type === 'copy' ? 'Copy Debt Account' : 'Add Debt Account'} 
          onClose={() => setModal(null)}
        >
          <DebtForm planId={plan.id} onClose={() => setModal(null)} initialData={modal.data} />
        </Modal>
      )}
    </div>
  )
}

// ============================================================
// Investments
// ============================================================

export function InvestmentForm({ planId, onClose, initialData }: { 
  planId: string; 
  onClose: () => void;
  initialData?: Partial<InvestmentAccount>;
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(initialData?.name ?? '')
  const [type, setType] = useState<AccountType>(initialData?.type ?? 'trad_401k')
  const [balance, setBalance] = useState(initialData?.balance ?? 0)
  const [contribBasis, setContribBasis] = useState<ContribBasis>(initialData?.contrib_basis ?? 'fixed')
  const [contrib, setContrib] = useState(initialData?.monthly_contrib ?? 0)
  const [contribPercent, setContribPercent] = useState((initialData?.contrib_percent ?? 0) * 100)
  const [match, setMatch] = useState((initialData?.employer_match ?? 0) * 100)
  const [matchCap, setMatchCap] = useState((initialData?.employer_match_cap ?? 0) * 100)
  const [stockPct, setStockPct] = useState((initialData?.asset_allocation?.stock_pct ?? 0.9) * 100)
  const [bondPct, setBondPct] = useState((initialData?.asset_allocation?.bond_pct ?? 0.1) * 100)
  const [startMonth, setStartMonth] = useState(initialData?.start_month ?? 0)
  const [goalTarget, setGoalTarget] = useState(initialData?.goal_target ?? 0)
  const [goalLabel, setGoalLabel] = useState(initialData?.goal_label ?? '')

  const mut = useMutation({
    mutationFn: () => {
      const data = {
        name, type, balance,
        monthly_contrib: contribBasis === 'fixed' ? contrib : 0,
        contrib_basis: contribBasis,
        contrib_percent: contribBasis !== 'fixed' ? contribPercent / 100 : 0,
        employer_match: match / 100,
        employer_match_cap: matchCap / 100,
        asset_allocation: {
          stock_pct: stockPct / 100,
          bond_pct: bondPct / 100,
          cash_pct: Math.max(0, 1 - stockPct / 100 - bondPct / 100),
        },
        start_month: startMonth,
        goal_target: goalTarget,
        goal_label: goalLabel,
      }
      if (initialData?.id) {
        return updateInvestment(planId, initialData.id, { ...data, id: initialData.id, plan_id: planId })
      }
      return createInvestment(planId, data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', planId] }); qc.invalidateQueries({ queryKey: ['simulate', planId] }); onClose() },
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
    { value: 'cash', label: 'Cash / HYSA' },
    { value: 'savings', label: 'High-Yield Savings' },
    { value: 'money_market', label: 'Money Market' },
  ]
  
  const basisOpts: { value: ContribBasis; label: string }[] = [
    { value: 'fixed', label: 'Fixed Amount ($)' },
    { value: 'gross', label: '% of Gross Income' },
    { value: 'net', label: '% of Net Income' },
    { value: 'remainder', label: 'Remainder Cash Flow' },
  ]

  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate() }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name"><Str value={name} onChange={setName} placeholder="e.g. Hospital 401k" /></Field>
        <Field label="Account Type"><Select value={type} onChange={v => setType(v as AccountType)} options={accountTypes} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Current Balance ($)"><Num value={balance} onChange={setBalance} placeholder="0" min={0} /></Field>
        {contribBasis === 'fixed' ? (
          <Field label="Monthly Contribution ($)"><Num value={contrib} onChange={setContrib} placeholder="500" min={0} /></Field>
        ) : (
          <Field label="Contribution (%)"><Num value={contribPercent} onChange={setContribPercent} placeholder="10" min={0} max={100} step={0.5} /></Field>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Contribution Basis"><Select value={contribBasis} onChange={v => setContribBasis(v as ContribBasis)} options={basisOpts} /></Field>
        <Field label="Employer Match (%)"><Num value={match} onChange={setMatch} placeholder="0" min={0} max={100} step={0.5} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
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
      <div className="rounded-lg border border-gray-700/40 bg-gray-800/20 p-3 space-y-3">
        <p className="text-xs font-medium text-gray-400">Savings Goal (optional)</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Goal Label">
            <Str value={goalLabel} onChange={setGoalLabel} placeholder="Emergency Fund" />
          </Field>
          <Field label="Target Balance ($)">
            <Num value={goalTarget} onChange={setGoalTarget} placeholder="0" min={0} />
          </Field>
        </div>
        <p className="text-[10px] text-gray-600">Set a target to track progress in the Goals panel.</p>
      </div>
      <SaveCancel onCancel={onClose} isPending={mut.isPending} />
    </form>
  )
}

export function InvestmentsTab({ plan }: { plan: Plan }) {
  const [modal, setModal] = useState<{ type: 'add' | 'edit' | 'copy'; data?: Partial<InvestmentAccount> } | null>(null)
  const qc = useQueryClient()
  const delMut = useMutation({
    mutationFn: (id: string) => deleteInvestment(plan.id, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', plan.id] }); qc.invalidateQueries({ queryKey: ['simulate', plan.id] }) },
  })

  return (
    <div className="space-y-3">
      {(plan.investment_accounts ?? []).map(inv => (
        <div key={inv.id} className="card">
          <div className="flex items-center justify-between mb-2">
            <p className="font-medium text-white">{inv.name}</p>
            <div className="flex items-center gap-3">
              <p className="font-semibold text-emerald-400">{fmt(inv.balance)}</p>
              <RowActions 
                onEdit={() => setModal({ type: 'edit', data: inv })}
                onCopy={() => {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { id, ...rest } = inv
                  setModal({ type: 'copy', data: rest })
                }}
                onDelete={() => delMut.mutate(inv.id)} 
                isPending={delMut.isPending} 
              />
            </div>
          </div>
          <div className="flex gap-4 text-sm text-gray-500">
            <span>{inv.type.replace(/_/g, ' ').toUpperCase()}</span>
            <span>
              {inv.contrib_basis === 'fixed' 
                ? `${fmt(inv.monthly_contrib)}/mo` 
                : `${(inv.contrib_percent * 100).toFixed(1)}% (${inv.contrib_basis})`}
            </span>
            <span>{Math.round(inv.asset_allocation.stock_pct * 100)}% stock / {Math.round(inv.asset_allocation.bond_pct * 100)}% bond</span>
          </div>
        </div>
      ))}
      {(plan.investment_accounts ?? []).length === 0 && (
        <p className="text-gray-600 text-sm py-8 text-center">No investment accounts yet.</p>
      )}
      <button onClick={() => setModal({ type: 'add' })} className="btn-secondary w-full text-sm">+ Add account</button>
      {modal && (
        <Modal 
          title={modal.type === 'edit' ? 'Edit Investment Account' : modal.type === 'copy' ? 'Copy Investment Account' : 'Add Investment Account'} 
          onClose={() => setModal(null)}
        >
          <InvestmentForm planId={plan.id} onClose={() => setModal(null)} initialData={modal.data} />
        </Modal>
      )}
    </div>
  )
}

// ============================================================
// Life Events
// ============================================================

export function EventForm({ planId, onClose, initialData }: { 
  planId: string; 
  onClose: () => void;
  initialData?: Partial<LifeEvent>;
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(initialData?.name ?? '')
  const [type, setType] = useState<EventType>(initialData?.type ?? 'milestone')
  const [month, setMonth] = useState(initialData?.month ?? 0)

  const mut = useMutation({
    mutationFn: () => {
      const data = { name, type, month, impacts: initialData?.impacts ?? [] }
      if (initialData?.id) {
        return updateEvent(planId, initialData.id, { ...data, id: initialData.id, plan_id: planId })
      }
      return createEvent(planId, data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', planId] }); qc.invalidateQueries({ queryKey: ['simulate', planId] }); onClose() },
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

export function EventsTab({ plan }: { plan: Plan }) {
  const [modal, setModal] = useState<{ type: 'add' | 'edit' | 'copy'; data?: Partial<LifeEvent> } | null>(null)
  const qc = useQueryClient()
  const delMut = useMutation({
    mutationFn: (id: string) => deleteEvent(plan.id, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', plan.id] }); qc.invalidateQueries({ queryKey: ['simulate', plan.id] }) },
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
              <RowActions 
                onEdit={() => setModal({ type: 'edit', data: ev })}
                onCopy={() => {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { id, ...rest } = ev
                  setModal({ type: 'copy', data: rest })
                }}
                onDelete={() => delMut.mutate(ev.id)} 
                isPending={delMut.isPending} 
              />
            </div>
          ))}
        </div>
      )}
      {events.length === 0 && (
        <p className="text-gray-600 text-sm py-8 text-center">No life events yet. Add your attending start date, major purchases, etc.</p>
      )}
      <button onClick={() => setModal({ type: 'add' })} className="btn-secondary w-full text-sm">+ Add life event</button>
      {modal && (
        <Modal 
          title={modal.type === 'edit' ? 'Edit Life Event' : modal.type === 'copy' ? 'Copy Life Event' : 'Add Life Event'} 
          onClose={() => setModal(null)}
        >
          <EventForm planId={plan.id} onClose={() => setModal(null)} initialData={modal.data} />
        </Modal>
      )}
    </div>
  )
}

// ============================================================
// Giving
// ============================================================

export function GivingForm({ planId, onClose, initialData }: { 
  planId: string; 
  onClose: () => void;
  initialData?: Partial<GivingTarget>;
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(initialData?.name ?? '')
  const [basis, setBasis] = useState<GivingBasis>(initialData?.basis ?? 'gross')
  const [percentage, setPercentage] = useState((initialData?.percentage ?? 0.1) * 100)
  const [startMonth, setStartMonth] = useState(initialData?.start_month ?? 0)

  const mut = useMutation({
    mutationFn: () => {
      const data = {
        name, basis, percentage: percentage / 100,
        start_month: startMonth,
      }
      if (initialData?.id) {
        return updateGiving(planId, initialData.id, { ...data, id: initialData.id, plan_id: planId })
      }
      return createGiving(planId, data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', planId] }); qc.invalidateQueries({ queryKey: ['simulate', planId] }); onClose() },
  })

  const basisOpts: { value: GivingBasis; label: string }[] = [
    { value: 'gross', label: 'Gross Income' },
    { value: 'net', label: 'Net Income (after tax)' },
    { value: 'remainder', label: 'Remainder Cash Flow' },
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

export function GivingTab({ plan }: { plan: Plan }) {
  const [modal, setModal] = useState<{ type: 'add' | 'edit' | 'copy'; data?: Partial<GivingTarget> } | null>(null)
  const qc = useQueryClient()
  const delMut = useMutation({
    mutationFn: (id: string) => deleteGiving(plan.id, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', plan.id] }); qc.invalidateQueries({ queryKey: ['simulate', plan.id] }) },
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
            <RowActions 
              onEdit={() => setModal({ type: 'edit', data: g })}
              onCopy={() => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { id, ...rest } = g
                setModal({ type: 'copy', data: rest })
              }}
              onDelete={() => delMut.mutate(g.id)} 
              isPending={delMut.isPending} 
            />
          </div>
        </div>
      ))}
      {(plan.giving_targets ?? []).length === 0 && (
        <p className="text-gray-600 text-sm py-8 text-center">No giving targets yet.</p>
      )}
      <button onClick={() => setModal({ type: 'add' })} className="btn-secondary w-full text-sm">+ Add giving target</button>
      {modal && (
        <Modal 
          title={modal.type === 'edit' ? 'Edit Giving Target' : modal.type === 'copy' ? 'Copy Giving Target' : 'Add Giving Target'} 
          onClose={() => setModal(null)}
        >
          <GivingForm planId={plan.id} onClose={() => setModal(null)} initialData={modal.data} />
        </Modal>
      )}
    </div>
  )
}
