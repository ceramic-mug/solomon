import { TrendingDown, CheckCircle2, AlertTriangle, Clock, DollarSign } from 'lucide-react'
import type { MonthSnapshot, Plan } from '../../api/types'

interface Props {
  snapshots: MonthSnapshot[]
  plan: Plan
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function calLabel(calMonth: number, year: number) {
  return `${MONTH_NAMES[(calMonth - 1) % 12]} ${year}`
}

export default function DebtFreedomPanel({ snapshots, plan }: Props) {
  const pslfDebts = (plan.debt_accounts ?? []).filter(d => d.pslf_eligible)
  const hasPSLF = pslfDebts.length > 0

  // Starting PSLF qualifying payments from plan data
  const startingPSLFPayments = pslfDebts.reduce((max, d) => Math.max(max, d.pslf_payments_made ?? 0), 0)

  // Debt-free: first snapshot where total_debt < $100
  const debtFreeIdx = snapshots.findIndex(s => s.total_debt < 100)
  const debtFreeSnap = debtFreeIdx >= 0 ? snapshots[debtFreeIdx] : null

  // PSLF forgiveness: first snapshot where qualifying payments >= 120
  const pslfIdx = snapshots.findIndex(s => (s.pslf_qualifying_payments ?? 0) >= 120)
  const pslfSnap = pslfIdx >= 0 ? snapshots[pslfIdx] : null

  // Estimate amount forgiven: the balance just before forgiveness month
  const pslfAmountForgiven = pslfIdx > 0 ? (snapshots[pslfIdx - 1]?.total_debt ?? 0) : 0

  // Total interest paid over full simulation
  const totalInterest = snapshots.reduce((sum, s) => sum + s.total_interest_paid, 0)

  // Total debt payments over simulation
  const totalDebtPayments = snapshots.reduce((sum, s) => sum + s.total_debt_payments, 0)

  // Starting debt
  const startDebt = snapshots[0]?.total_debt ?? 0

  // Current monthly debt payment (most recent non-zero)
  const currentDebtPayment = snapshots[0]?.total_debt_payments ?? 0

  // PSLF saves you vs paying off: how much more you'd pay if PSLF forgives early
  const pslfSavings = hasPSLF && pslfSnap && debtFreeSnap
    ? pslfAmountForgiven + (debtFreeSnap.total_debt > 0 ? debtFreeSnap.total_debt : 0)
    : 0

  return (
    <div className="space-y-3">
      {/* Debt payoff summary */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <TrendingDown size={15} className="text-red-400" />
          <span className="text-sm font-semibold text-white">Debt Trajectory</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-800/50 rounded-lg p-2.5">
            <p className="text-gray-500 mb-0.5">Starting Balance</p>
            <p className="text-red-400 font-semibold text-sm">{fmt(startDebt)}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2.5">
            <p className="text-gray-500 mb-0.5">Monthly Payment</p>
            <p className="text-white font-semibold text-sm">{fmt(currentDebtPayment)}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2.5">
            <p className="text-gray-500 mb-0.5">Total Interest</p>
            <p className="text-orange-400 font-semibold text-sm">{fmt(totalInterest)}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2.5">
            <p className="text-gray-500 mb-0.5">Total Paid Out</p>
            <p className="text-white font-semibold text-sm">{fmt(totalDebtPayments)}</p>
          </div>
        </div>

        {debtFreeSnap ? (
          <div className="flex items-center gap-2 bg-emerald-900/20 border border-emerald-800/30 rounded-lg px-3 py-2">
            <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Debt-Free Date</p>
              <p className="text-sm font-bold text-emerald-300">{calLabel(debtFreeSnap.calendar_month, debtFreeSnap.year)}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-gray-800/40 border border-gray-700/30 rounded-lg px-3 py-2">
            <AlertTriangle size={14} className="text-yellow-500 shrink-0" />
            <p className="text-xs text-gray-400">Debt not fully paid within 30-year window</p>
          </div>
        )}
      </div>

      {/* PSLF tracker */}
      {hasPSLF && (
        <div className="rounded-xl border border-purple-800/40 bg-purple-900/10 p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 size={15} className="text-purple-400" />
            <span className="text-sm font-semibold text-white">PSLF Tracker</span>
            <span className="ml-auto text-xs text-purple-300/60 font-mono">
              {startingPSLFPayments}/120
            </span>
          </div>

          {/* Progress bar */}
          <div>
            <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (startingPSLFPayments / 120) * 100)}%`,
                  background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-600 mt-1">
              <span>{startingPSLFPayments} qualifying payments made</span>
              <span>{Math.max(0, 120 - startingPSLFPayments)} remaining</span>
            </div>
          </div>

          {pslfSnap ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2 bg-purple-900/20 border border-purple-800/30 rounded-lg px-3 py-2">
                <Clock size={13} className="text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-400">Projected Forgiveness</p>
                  <p className="text-sm font-bold text-purple-300">{calLabel(pslfSnap.calendar_month, pslfSnap.year)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2 bg-purple-900/20 border border-purple-800/30 rounded-lg px-3 py-2">
                <DollarSign size={13} className="text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-400">Estimated Amount Forgiven</p>
                  <p className="text-sm font-bold text-purple-300">{fmt(pslfAmountForgiven)}</p>
                </div>
              </div>
              {pslfAmountForgiven > 0 && (
                <p className="text-xs text-purple-200/50 leading-relaxed">
                  PSLF forgives your remaining balance tax-free after 120 qualifying payments at a nonprofit/government employer.
                  {pslfAmountForgiven > 10_000 && ` This saves you ${fmt(pslfAmountForgiven)} vs. paying off normally.`}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-yellow-400/80">
                <AlertTriangle size={12} className="shrink-0" />
                No PSLF forgiveness in 30-year window
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                {120 - startingPSLFPayments} more qualifying payments needed. Your simulation may be paying
                off the loan before 120 payments are reached — try switching to IDR/SAVE and marking debts as
                PSLF-eligible.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Per-debt breakdown */}
      {(plan.debt_accounts?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
          <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">Debt Accounts</p>
          <div className="space-y-2">
            {(plan.debt_accounts ?? []).map(debt => {
              const finalBalance = snapshots[snapshots.length - 1]?.debt_balances?.[debt.id] ?? 0
              const paidOff = finalBalance < 100
              return (
                <div key={debt.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${paidOff ? 'bg-emerald-400' : 'bg-red-400'}`}
                    />
                    <span className="text-gray-300 truncate">{debt.name}</span>
                    {debt.pslf_eligible && (
                      <span className="text-[10px] text-purple-400 bg-purple-900/30 px-1 rounded shrink-0">PSLF</span>
                    )}
                    <span className="text-gray-600 shrink-0">
                      {debt.repayment_plan !== 'standard' ? debt.repayment_plan.toUpperCase() : ''}
                    </span>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    {paidOff ? (
                      <span className="text-emerald-400">Paid off ✓</span>
                    ) : (
                      <span className="text-red-400">{fmt(finalBalance)} remaining</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
