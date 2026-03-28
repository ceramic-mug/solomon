import { useState, useEffect, useRef } from 'react'
import { ChevronDown, ChevronRight, SlidersHorizontal } from 'lucide-react'
import { simulateOverride } from '../../api/client'
import type { MonthSnapshot } from '../../api/types'

interface Props {
  planId: string
  simParams?: { filing_status?: string; household_size?: number; state_tax?: number }
  onResult: (snapshots: MonthSnapshot[] | null) => void
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}

function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-400">{label}</label>
        <span className="text-xs font-mono text-white">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gray-700 accent-amber-400"
      />
      <div className="flex justify-between text-[10px] text-gray-600">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  )
}

export default function SensitivityPanel({ planId, simParams, onResult }: Props) {
  const [open, setOpen] = useState(false)
  const [extraPayment, setExtraPayment] = useState(0)
  const [stockReturn, setStockReturn] = useState(7)
  const [incomeGrowth, setIncomeGrowth] = useState(3)
  const [contribMult, setContribMult] = useState(100)
  const [unforeseenExpense, setUnforeseenExpense] = useState(0)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isDefault = extraPayment === 0 && stockReturn === 7 && incomeGrowth === 3 && contribMult === 100 && unforeseenExpense === 0

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (isDefault) {
      onResult(null)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const result = await simulateOverride(planId, {
          extra_payment_delta: extraPayment,
          stock_return_override: stockReturn / 100,
          income_growth_override: incomeGrowth / 100,
          contribution_multiplier: contribMult / 100,
          unforeseen_expense_monthly: unforeseenExpense,
        }, simParams)
        onResult(result.monthly_snapshots)
      } catch {
        onResult(null)
      } finally {
        setLoading(false)
      }
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [extraPayment, stockReturn, incomeGrowth, contribMult, unforeseenExpense, planId, open])

  function reset() {
    setExtraPayment(0)
    setStockReturn(7)
    setIncomeGrowth(3)
    setContribMult(100)
    setUnforeseenExpense(0)
    onResult(null)
  }

  return (
    <div className="rounded-xl border border-amber-800/30 bg-amber-900/5">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
      >
        <SlidersHorizontal size={14} className="text-amber-400 shrink-0" />
        <span className="text-sm font-medium text-white flex-1">Sensitivity Analysis</span>
        {loading && <span className="text-[10px] text-amber-400 animate-pulse">calculating…</span>}
        {!isDefault && !loading && (
          <span className="text-[10px] text-amber-400 bg-amber-900/30 px-1.5 py-0.5 rounded">active</span>
        )}
        {open ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-5 border-t border-amber-800/20 pt-4">
          <p className="text-[11px] text-gray-500">
            Adjust assumptions below to see a what-if overlay (dashed amber line) on the net worth chart.
            Nothing is saved.
          </p>

          <Slider
            label="Extra Debt Payment / month"
            value={extraPayment}
            min={-500}
            max={2000}
            step={50}
            format={v => v === 0 ? '$0' : `${v > 0 ? '+' : ''}$${v.toLocaleString()}`}
            onChange={setExtraPayment}
          />
          <Slider
            label="Stock Return Assumption"
            value={stockReturn}
            min={2}
            max={14}
            step={0.5}
            format={v => `${v}%`}
            onChange={setStockReturn}
          />
          <Slider
            label="Salary Income Growth"
            value={incomeGrowth}
            min={-2}
            max={8}
            step={0.5}
            format={v => `${v}%`}
            onChange={setIncomeGrowth}
          />
          <Slider
            label="Investment Contributions"
            value={contribMult}
            min={50}
            max={200}
            step={10}
            format={v => `${v}%`}
            onChange={setContribMult}
          />
          <Slider
            label="Unforeseen Expenses / mo"
            value={unforeseenExpense}
            min={0}
            max={3000}
            step={100}
            format={v => v === 0 ? '$0' : `+$${v.toLocaleString()}`}
            onChange={setUnforeseenExpense}
          />

          {!isDefault && (
            <button
              onClick={reset}
              className="text-xs text-gray-500 hover:text-amber-400 transition-colors"
            >
              Reset to defaults
            </button>
          )}
        </div>
      )}
    </div>
  )
}
