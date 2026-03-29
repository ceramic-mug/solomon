import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Sparkles, X, ChevronRight, CheckCircle2, Loader2, Bot,
  DollarSign, CreditCard, PiggyBank, Heart, Baby, TrendingUp,
  SkipForward, AlertCircle, Edit3, ArrowLeft, Zap, ArrowUpDown,
} from 'lucide-react'

// ---- Types ----

type Phase = 'collect' | 'constraints' | 'structuring' | 'review' | 'building' | 'done'

interface WizardStep {
  id: string
  icon: React.ReactNode
  title: string
  question: string
  hint: string
  placeholder: string
  optional?: boolean
  examples: string[]
}

interface RedirectDest {
  enabled: boolean
  pct: number   // 0–100
}

interface CashFlowConstraint {
  enabled: boolean
  mode: 'dollar' | 'percent'
  targetMonthly: number
  targetPercent: number
  investments: RedirectDest
  savings: RedirectDest
  giving: RedirectDest
  description: string  // free-text detail for AI
}

interface NetWorthCeiling {
  enabled: boolean
  ceiling: number
}

interface ToolEvent {
  tool: string
  status: 'running' | 'done' | 'error'
}

// ---- Step definitions ----

const STEPS: WizardStep[] = [
  {
    id: 'income',
    icon: <DollarSign size={16} />,
    title: 'Income',
    question: "What's your current role and compensation?",
    hint: 'Include specialty, training year, and planned transitions. Add your spouse/partner if applicable.',
    placeholder: 'e.g. PGY-2 internal medicine at $68k/yr, starting hospitalist attending July 2027 at $270k. Wife is PGY-1 family med at $62k, starting attending 2026 at $220k.',
    examples: [
      "PGY-2 internal med at $67k/yr, starting hospitalist July 2027 at $260k\nWife: PGY-1 family med at $62k, starts attending July 2025 at $220k",
      "First-year attending cardiologist at $420k salary, $50k signing bonus this year",
      "Fellow at $72k, private practice in 18 months at ~$350k. Wife is a teacher at $52k/yr.",
    ],
  },
  {
    id: 'debts',
    icon: <CreditCard size={16} />,
    title: 'Debts',
    question: 'Tell me about your loans and debts.',
    hint: 'Include student loan totals, interest rates, repayment plan, and PSLF status. Add mortgage or auto loans if applicable.',
    placeholder: 'e.g. Combined $400k in federal loans at 6.5%, income-driven repayment, PSLF eligible, 24 payments made. $320k mortgage at 6.75% on a $420k home.',
    optional: true,
    examples: [
      "$280k federal loans at 6.8%, on SAVE plan, nonprofit hospital (PSLF eligible), 18 payments made",
      "Combined $450k med school loans at 7%, considering PSLF. $30k car loan at 6.9% paying $550/mo.",
      "100k mortgage at 3.5%, ~$800/mo. 30k car loan at 7%, ~$1000/mo. Combined ~400k student loans, PSLF plan.",
    ],
  },
  {
    id: 'expenses',
    icon: <TrendingUp size={16} />,
    title: 'Expenses',
    question: 'What are your major monthly expenses?',
    hint: 'Housing, food, transport, insurance, utilities, subscriptions. Estimates are fine.',
    placeholder: 'e.g. $2,200/mo rent, $400/mo car, $350/mo disability insurance, $200/mo groceries...',
    optional: true,
    examples: [
      "$2,200/mo rent, $300/mo disability insurance, $150/mo subscriptions, $600/mo food",
      "$750 food, $150 gas, $500 utilities, $150 subscriptions",
      "Just rent at $1,800/mo, otherwise typical expenses",
    ],
  },
  {
    id: 'savings',
    icon: <PiggyBank size={16} />,
    title: 'Savings & Investments',
    question: 'What savings and investment accounts do you have?',
    hint: 'Balances, monthly contributions, employer match. Mention 403(b)/457(b)/HSA availability. Include any savings goals.',
    placeholder: 'e.g. $22k in 403b (employer matches 4%), $8k HSA, $5k emergency fund, want 10%/mo to investments...',
    optional: true,
    examples: [
      "10%/month net income to investments. 5%/mo to general high-yield savings. 5%/mo to 529 college fund.",
      "$45k in 401k (maxing it), $12k HSA, $30k taxable brokerage, 6-month emergency fund",
      "No retirement savings yet, hospital offers 403b and 457b with no match",
    ],
  },
  {
    id: 'giving',
    icon: <Heart size={16} />,
    title: 'Giving',
    question: 'Do you have charitable giving commitments?',
    hint: 'Tithes, church giving, recurring donations. Specify amounts, percentages, and whether pre- or post-tax.',
    placeholder: 'e.g. 10% tithe on gross income, $200/mo to local food bank, want 20% total giving...',
    optional: true,
    examples: [
      "$1,000/mo minimum tithe, 10% of gross if greater. $100/mo CRU. $25/mo child sponsorship. $200/mo misc. Total 20% gross.",
      "10% gross tithe starting now. Want to increase to 15% when I become an attending.",
      "No regular giving commitments yet",
    ],
  },
  {
    id: 'children',
    icon: <Baby size={16} />,
    title: 'Family',
    question: 'Do you have or plan to have children?',
    hint: "I'll model costs from birth through college — activities, K-12, and college. Public or private school preference.",
    placeholder: 'e.g. one child born 8 months ago, planning a second in 2 years, prefer private school for both...',
    optional: true,
    examples: [
      "Two kids planned — first in ~2 years, second 2 years after that. Public school. Want 529 for each.",
      "One kid, 8 months old, public school, no 529 yet",
      "No children planned",
    ],
  },
  {
    id: 'goals',
    icon: <Sparkles size={16} />,
    title: 'Goals',
    question: 'What are your financial goals?',
    hint: 'Retirement age, net worth targets, debt freedom timeline, home purchase, anything important to model.',
    placeholder: 'e.g. retire at 55 with $3M invested, debt-free in 8 years, buy a home in 3 years...',
    examples: [
      "Retire at 58 with $4M. Want to be PSLF-forgiven in 6 years then aggressively pay mortgage.",
      "Debt-free as fast as possible, then max everything and retire at 55.",
      "Buy a house in 3 years ($80k down payment goal). Retire at 60. Would like to cap accumulation at $8M and give the rest away.",
    ],
  },
]

// ---- Helpers ----

const TOOL_LABELS: Record<string, string> = {
  add_income: 'Income stream',
  add_debt: 'Debt account',
  add_investment: 'Investment account',
  add_expense: 'Expense',
  add_giving: 'Giving target',
  add_child: 'Child',
  add_life_event: 'Life event',
  set_cash_flow_constraint: 'Cash flow constraint',
  set_net_worth_ceiling: 'Net worth ceiling',
  modify_income: 'Income update',
  modify_expense: 'Expense update',
  modify_debt: 'Debt update',
  modify_investment: 'Investment update',
  delete_income: 'Removed income',
  delete_expense: 'Removed expense',
  delete_debt: 'Removed debt',
  delete_investment: 'Removed investment',
  create_fork: 'Plan fork',
}

/** Returns the enabled destinations clamped to sum to 100, normalized proportionally. */
function normalizePcts(cf: CashFlowConstraint): CashFlowConstraint {
  const keys = (['investments', 'savings', 'giving'] as const).filter(k => cf[k].enabled)
  if (keys.length === 0) return cf
  const total = keys.reduce((s, k) => s + cf[k].pct, 0)
  if (total === 0) {
    const even = Math.round(100 / keys.length)
    const next = { ...cf }
    keys.forEach(k => { next[k] = { ...next[k], pct: even } })
    return next
  }
  return cf
}

function buildConstraintInstructions(cf: CashFlowConstraint, nwc: NetWorthCeiling): string {
  let out = ''

  if (cf.enabled) {
    const dests = (['investments', 'savings', 'giving'] as const)
      .filter(k => cf[k].enabled)
      .map(k => `${cf[k].pct}% to ${k}`)
    const destStr = dests.length ? dests.join(', ') : 'investments'
    const constrainFlags = [
      cf.investments.enabled && 'constrain_investments=true',
      cf.savings.enabled && 'constrain_savings=true',
      cf.giving.enabled && 'constrain_giving=true',
    ].filter(Boolean).join(', ')

    if (cf.mode === 'dollar' && cf.targetMonthly > 0) {
      out += `\n\n### Cash Flow Redirect Instruction\n` +
        `Call set_cash_flow_constraint with target_cash_flow=${cf.targetMonthly}, ${constrainFlags || 'constrain_investments=true'}.\n` +
        `After applying the constraint, redirect surplus cash as follows: ${destStr}.\n` +
        `For investment destinations: set contrib_basis='remainder' on the relevant account(s) with contrib_percent proportional to the allocation.\n` +
        `For giving destinations: set basis='remainder' on the relevant giving target(s) with percentage proportional to the allocation.\n` +
        `For savings destinations: treat as a savings investment account with contrib_basis='remainder'.`
    } else if (cf.mode === 'percent' && cf.targetPercent > 0) {
      out += `\n\n### Cash Flow Redirect Instruction\n` +
        `The user wants to keep ${cf.targetPercent}% of net monthly income as retained cash flow and redirect the rest. ` +
        `Estimate an approximate monthly dollar amount from their income and call set_cash_flow_constraint accordingly with ${constrainFlags || 'constrain_investments=true'}.\n` +
        `Redirect the surplus as follows: ${destStr}.\n` +
        `For investment destinations: set contrib_basis='remainder' on the relevant account(s).\n` +
        `For giving destinations: set basis='remainder' on the relevant giving target(s).`
    }
    if (cf.description.trim()) {
      out += `\nUser's specific allocation notes: "${cf.description.trim()}"`
    }
  }

  if (nwc.enabled && nwc.ceiling > 0) {
    out += `\n\n### Net Worth Ceiling Instruction\n` +
      `Call set_net_worth_ceiling with enabled=true and ceiling=${nwc.ceiling}. ` +
      `When net worth reaches this ceiling, excess investment growth is diverted to charitable giving.`
  }

  return out
}

function buildAgentMessage(markdown: string, cf: CashFlowConstraint, nwc: NetWorthCeiling): string {
  return (
    `Build a complete financial plan from the structured description below. ` +
    `Use all available tools to create income streams, debts, expenses, investments, giving targets, ` +
    `children, and life events as described. Model all transitions (e.g. resident → attending) with ` +
    `appropriate start/end months. Do NOT ask for confirmation — apply everything immediately.\n\n` +
    markdown +
    buildConstraintInstructions(cf, nwc)
  )
}

// ---- Toggle component ----

function Toggle({ checked, onChange, color = 'blue' }: { checked: boolean; onChange: (v: boolean) => void; color?: 'blue' | 'teal' }) {
  const bg = checked ? (color === 'teal' ? 'bg-teal-600' : 'bg-blue-600') : 'bg-gray-700'
  return (
    <label className="flex items-center shrink-0 cursor-pointer" onClick={e => e.stopPropagation()}>
      <div className="relative" onClick={() => onChange(!checked)}>
        <div className={`w-10 h-5 rounded-full transition-colors ${bg}`} />
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </div>
    </label>
  )
}

// ---- Main component ----

export default function PlanBuilderWizard({ planId, onClose }: { planId: string; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('collect')
  const [currentStep, setCurrentStep] = useState(0)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [cashFlow, setCashFlow] = useState<CashFlowConstraint>({
    enabled: false,
    mode: 'dollar',
    targetMonthly: 3000,
    targetPercent: 20,
    investments: { enabled: true, pct: 100 },
    savings:     { enabled: false, pct: 0 },
    giving:      { enabled: false, pct: 0 },
    description: '',
  })
  const [netWorthCeiling, setNetWorthCeiling] = useState<NetWorthCeiling>({ enabled: false, ceiling: 10_000_000 })
  const [markdown, setMarkdown] = useState('')
  const [structuringError, setStructuringError] = useState<string | null>(null)
  const [tools, setTools] = useState<ToolEvent[]>([])
  const [buildError, setBuildError] = useState<string | null>(null)
  const qc = useQueryClient()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const step = STEPS[currentStep]

  useEffect(() => { textareaRef.current?.focus() }, [currentStep, phase])

  // ---- Collect helpers ----

  const handleCollectKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); advanceStep() }
  }

  const advanceStep = (skip = false) => {
    if (!skip && !inputs[step.id]?.trim() && !step.optional) return
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(s => s + 1)
    } else {
      setPhase('constraints')
    }
  }

  // ---- Constraint helpers ----

  const setDest = (key: 'investments' | 'savings' | 'giving', patch: Partial<RedirectDest>) => {
    setCashFlow(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  // Auto-distribute pct evenly when a destination is toggled on
  const toggleDest = (key: 'investments' | 'savings' | 'giving', on: boolean) => {
    setCashFlow(prev => {
      const next = { ...prev, [key]: { ...prev[key], enabled: on } }
      const enabled = (['investments', 'savings', 'giving'] as const).filter(k => next[k].enabled)
      if (enabled.length === 0) return next
      const even = Math.floor(100 / enabled.length)
      const rem = 100 - even * enabled.length
      enabled.forEach((k, i) => { next[k] = { ...next[k], pct: even + (i === 0 ? rem : 0) } })
      return next
    })
  }

  const activeDests = (['investments', 'savings', 'giving'] as const).filter(k => cashFlow[k].enabled)
  const pctTotal = activeDests.reduce((s, k) => s + cashFlow[k].pct, 0)

  // ---- Structure (AI intermediate) ----

  const runStructuring = async () => {
    setPhase('structuring')
    setStructuringError(null)
    const allText = STEPS
      .filter(s => inputs[s.id]?.trim())
      .map(s => `### ${s.title}\n${inputs[s.id].trim()}`)
      .join('\n\n')

    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch('/ai/structure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ plan_id: planId, text: allText }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      setMarkdown(data.markdown ?? '')
      setPhase('review')
    } catch (err) {
      setStructuringError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  // ---- Build ----

  const handleBuild = async () => {
    setPhase('building')
    setTools([])
    setBuildError(null)

    const message = buildAgentMessage(markdown, normalizePcts(cashFlow), netWorthCeiling)
    const liveTools: ToolEvent[] = []

    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch('/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ plan_id: planId, message }),
      })
      if (!res.ok) throw new Error(`Server error: ${res.status}`)

      if (res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const evt = JSON.parse(line.slice(6))
              if (evt.type === 'tool_call') {
                liveTools.push({ tool: evt.tool, status: 'running' })
                setTools([...liveTools])
              } else if (evt.type === 'tool_result') {
                let idx = -1
                for (let j = liveTools.length - 1; j >= 0; j--) {
                  if (liveTools[j].tool === evt.tool && liveTools[j].status === 'running') { idx = j; break }
                }
                if (idx >= 0) liveTools[idx] = { ...liveTools[idx], status: 'done' }
                setTools([...liveTools])
              }
            } catch { /* ignore */ }
          }
        }
      }

      await qc.invalidateQueries({ queryKey: ['plan', planId] })
      await qc.invalidateQueries({ queryKey: ['simulate', planId] })
      setPhase('done')
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : 'Something went wrong')
      setPhase('review')
    }
  }

  // ==============================
  // ---- Phase: done ----
  // ==============================

  if (phase === 'done') {
    const done = tools.filter(t => t.status === 'done')
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
        <div className="card w-full max-w-md text-center space-y-6 py-12 px-8">
          <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={40} className="text-emerald-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Plan Built!</h2>
            <p className="text-gray-400 mt-1">Solomon applied {done.length} changes to your plan.</p>
          </div>
          <button onClick={onClose} className="btn-primary px-8">View My Dashboard</button>
        </div>
      </div>
    )
  }

  // ==============================
  // ---- Phase: building ----
  // ==============================

  if (phase === 'building') {
    const done = tools.filter(t => t.status === 'done').length
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
        <div className="card w-full max-w-md space-y-6 p-8">
          <div className="flex items-center gap-3">
            <Loader2 size={22} className="animate-spin text-blue-400 shrink-0" />
            <div>
              <p className="text-white font-semibold">Building your plan…</p>
              <p className="text-xs text-gray-500">{done}/{tools.length || '?'} items created</p>
            </div>
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {tools.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {t.status === 'running'
                  ? <Loader2 size={12} className="animate-spin text-blue-400 shrink-0" />
                  : <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />}
                <span className={t.status === 'done' ? 'text-emerald-400' : 'text-blue-400'}>
                  {TOOL_LABELS[t.tool] ?? t.tool}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ==============================
  // ---- Phase: structuring ----
  // ==============================

  if (phase === 'structuring') {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
        <div className="card w-full max-w-sm space-y-6 p-8 text-center">
          {structuringError ? (
            <>
              <AlertCircle size={40} className="text-red-400 mx-auto" />
              <div>
                <p className="text-white font-semibold">Structuring failed</p>
                <p className="text-xs text-gray-500 mt-1">{structuringError}</p>
              </div>
              <div className="flex gap-3 justify-center">
                <button onClick={() => setPhase('constraints')} className="btn-secondary text-sm flex items-center gap-1.5">
                  <ArrowLeft size={14} /> Back
                </button>
                <button onClick={runStructuring} className="btn-primary text-sm">Retry</button>
              </div>
            </>
          ) : (
            <>
              <Loader2 size={40} className="animate-spin text-blue-400 mx-auto" />
              <div>
                <p className="text-white font-semibold">Organizing your plan…</p>
                <p className="text-xs text-gray-500 mt-1">Solomon is structuring the details and spelling out assumptions</p>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ==============================
  // ---- Phase: review ----
  // ==============================

  if (phase === 'review') {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
        <div className="card w-full max-w-3xl flex flex-col max-h-[94vh] overflow-hidden">

          <div className="p-5 border-b border-gray-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
                <Edit3 size={16} className="text-white" />
              </div>
              <div>
                <h2 className="font-bold text-white">Review Your Plan</h2>
                <p className="text-xs text-gray-500">Edit anything — these details will be used to build your simulation</p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-600 hover:text-white transition-colors p-1"><X size={20} /></button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-4">
            <p className="text-xs text-gray-500 leading-relaxed">
              Solomon has structured your description into an itemized plan with assumptions made explicit.
              Edit any values below, then click <span className="text-white font-medium">Build My Plan</span>.
            </p>
            <textarea
              ref={textareaRef}
              value={markdown}
              onChange={e => setMarkdown(e.target.value)}
              className="w-full font-mono text-sm text-gray-300 bg-gray-950 border border-gray-800 rounded-xl p-4 focus:outline-none focus:border-blue-500/50 resize-none"
              style={{ minHeight: 360 }}
              spellCheck={false}
            />
            {buildError && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <AlertCircle size={13} className="shrink-0" /> {buildError}
              </div>
            )}
          </div>

          <div className="shrink-0 p-4 border-t border-gray-800 flex items-center justify-between">
            <button
              onClick={() => setPhase('constraints')}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              <ArrowLeft size={14} /> Back
            </button>
            <button onClick={handleBuild} className="btn-primary flex items-center gap-2 px-6 py-2.5">
              <Sparkles size={16} /> Build My Plan
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ==============================
  // ---- Phase: constraints ----
  // ==============================

  if (phase === 'constraints') {
    const destLabels = { investments: 'Investment accounts', savings: 'Savings accounts', giving: 'Giving targets' }
    const destColors = { investments: 'blue', savings: 'blue', giving: 'teal' } as const

    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
        <div className="card w-full max-w-2xl flex flex-col max-h-[94vh] overflow-hidden">

          <div className="p-5 border-b border-gray-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
                <Zap size={16} className="text-white" />
              </div>
              <div>
                <h2 className="font-bold text-white">Cash Flow &amp; Generosity Strategy</h2>
                <p className="text-xs text-gray-500">Optional — configure how surplus cash and accumulation are managed</p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-600 hover:text-white transition-colors p-1"><X size={20} /></button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-4">

            {/* ---- Cash Flow Redirect ---- */}
            <div className={`rounded-xl border p-4 space-y-4 transition-colors ${cashFlow.enabled ? 'border-blue-500/30 bg-blue-500/5' : 'border-gray-800 bg-gray-900/30'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Zap size={16} className={`mt-0.5 shrink-0 ${cashFlow.enabled ? 'text-blue-400' : 'text-gray-600'}`} />
                  <div>
                    <p className="text-sm font-semibold text-white">Cash Flow Redirect</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      Cap how much cash you keep each month and automatically sweep the surplus into investments,
                      savings, or giving — implementing "live on $X and invest the rest."
                    </p>
                  </div>
                </div>
                <Toggle checked={cashFlow.enabled} onChange={v => setCashFlow(p => ({ ...p, enabled: v }))} />
              </div>

              {cashFlow.enabled && (
                <div className="space-y-4 pl-7">
                  {/* Mode + amount */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex rounded-lg overflow-hidden border border-gray-700 text-xs shrink-0">
                      {(['dollar', 'percent'] as const).map(m => (
                        <button
                          key={m}
                          onClick={() => setCashFlow(p => ({ ...p, mode: m }))}
                          className={`px-3 py-1.5 transition-colors ${cashFlow.mode === m ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                          {m === 'dollar' ? '$ Fixed' : '% Of income'}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">Keep</span>
                    {cashFlow.mode === 'dollar' ? (
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                        <input
                          type="number"
                          value={cashFlow.targetMonthly}
                          onChange={e => setCashFlow(p => ({ ...p, targetMonthly: Number(e.target.value) }))}
                          className="input pl-7 w-36 text-sm py-1.5"
                          step={500}
                        />
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="number"
                          value={cashFlow.targetPercent}
                          onChange={e => setCashFlow(p => ({ ...p, targetPercent: Math.min(100, Math.max(0, Number(e.target.value))) }))}
                          className="input pr-7 w-24 text-sm py-1.5"
                          min={0} max={100} step={5}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
                      </div>
                    )}
                    <span className="text-xs text-gray-400 shrink-0">
                      {cashFlow.mode === 'dollar' ? '/mo as cash. Redirect surplus to:' : 'of income. Redirect rest to:'}
                    </span>
                  </div>

                  {/* Destination toggles + % inputs */}
                  <div className="space-y-2">
                    {(['investments', 'savings', 'giving'] as const).map(key => (
                      <div key={key} className={`flex items-center gap-3 rounded-lg px-3 py-2 border transition-colors ${
                        cashFlow[key].enabled ? 'border-blue-500/20 bg-blue-500/5' : 'border-gray-800 bg-transparent'
                      }`}>
                        <input
                          type="checkbox"
                          checked={cashFlow[key].enabled}
                          onChange={e => toggleDest(key, e.target.checked)}
                          className="w-3.5 h-3.5 rounded accent-blue-500 shrink-0"
                        />
                        <span className={`text-xs flex-1 ${cashFlow[key].enabled ? 'text-gray-300' : 'text-gray-500'}`}>
                          {destLabels[key]}
                        </span>
                        {cashFlow[key].enabled && activeDests.length > 1 && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={cashFlow[key].pct}
                              onChange={e => setDest(key, { pct: Math.min(100, Math.max(0, Number(e.target.value))) })}
                              className="input w-16 text-xs py-1 text-center font-mono"
                            />
                            <span className="text-xs text-gray-500">%</span>
                          </div>
                        )}
                        {cashFlow[key].enabled && activeDests.length === 1 && (
                          <span className="text-xs text-gray-500 font-mono shrink-0">100%</span>
                        )}
                      </div>
                    ))}
                    {activeDests.length > 1 && pctTotal !== 100 && (
                      <p className="text-xs text-amber-400/80 pl-1">
                        Percentages sum to {pctTotal}% — adjust to reach 100%
                      </p>
                    )}
                  </div>

                  {/* Optional free-text detail */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-500">
                      Specific allocation notes <span className="text-gray-700">(optional)</span>
                    </label>
                    <textarea
                      value={cashFlow.description}
                      onChange={e => setCashFlow(p => ({ ...p, description: e.target.value }))}
                      placeholder='e.g. "Split investments 50% 403b / 50% taxable brokerage. Giving should go to our church tithe target."'
                      rows={2}
                      className="input w-full text-sm resize-none bg-gray-900/60 border-gray-800"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ---- Net Worth Ceiling ---- */}
            <div className={`rounded-xl border p-4 space-y-4 transition-colors ${netWorthCeiling.enabled ? 'border-teal-500/30 bg-teal-500/5' : 'border-gray-800 bg-gray-900/30'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <ArrowUpDown size={16} className={`mt-0.5 shrink-0 ${netWorthCeiling.enabled ? 'text-teal-400' : 'text-gray-600'}`} />
                  <div>
                    <p className="text-sm font-semibold text-white">Net Worth Ceiling</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      Once your net worth reaches this cap, excess investment growth is automatically diverted to
                      charitable giving — modeling intentional generosity. Accumulate up to $X, then give away the rest.
                    </p>
                  </div>
                </div>
                <Toggle checked={netWorthCeiling.enabled} onChange={v => setNetWorthCeiling(p => ({ ...p, enabled: v }))} color="teal" />
              </div>

              {netWorthCeiling.enabled && (
                <div className="pl-7 flex items-center gap-2">
                  <span className="text-xs text-gray-400 shrink-0">Cap at</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                    <input
                      type="number"
                      value={netWorthCeiling.ceiling}
                      onChange={e => setNetWorthCeiling(p => ({ ...p, ceiling: Number(e.target.value) }))}
                      className="input pl-7 w-48 text-sm py-1.5"
                      step={500_000}
                    />
                  </div>
                  <span className="text-xs text-gray-400">total net worth</span>
                </div>
              )}
            </div>

          </div>

          <div className="shrink-0 p-4 border-t border-gray-800 flex items-center justify-between">
            <button
              onClick={() => { setPhase('collect'); setCurrentStep(STEPS.length - 1) }}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              <ArrowLeft size={14} /> Back
            </button>
            <button onClick={runStructuring} className="btn-primary flex items-center gap-2 px-6 py-2.5">
              <Sparkles size={16} /> Preview Plan
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ==============================
  // ---- Phase: collect ----
  // ==============================

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="card w-full max-w-2xl flex flex-col max-h-[92vh] overflow-hidden">

        <div className="p-5 border-b border-gray-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
              <Sparkles size={17} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-white">Solomon Plan Builder</h2>
              <p className="text-xs text-gray-500">Step {currentStep + 1} of {STEPS.length}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-white transition-colors p-1"><X size={20} /></button>
        </div>

        {/* Progress */}
        <div className="shrink-0 px-5 pt-4 pb-2">
          <div className="flex gap-1.5 mb-2">
            {STEPS.map((s, i) => (
              <button key={s.id} onClick={() => i <= currentStep && setCurrentStep(i)} className="flex-1 group">
                <div className={`h-1 rounded-full transition-all duration-300 ${
                  i < currentStep ? 'bg-emerald-500' :
                  i === currentStep ? 'bg-blue-500' : 'bg-gray-800'
                }`} />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={currentStep === STEPS.indexOf(step) ? 'text-blue-400' : 'text-gray-500'}>{step.icon}</span>
            <span className="font-medium text-gray-400">{step.title}</span>
            {step.optional && <span className="text-gray-600">· optional</span>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
          <div>
            <div className="flex items-center gap-1.5 text-blue-400 text-xs font-medium mb-2">
              <Bot size={13} /><span>SOLOMON</span>
            </div>
            <h1 className="text-xl font-semibold text-white">{step.question}</h1>
            <p className="text-gray-500 text-sm mt-1">{step.hint}</p>
          </div>

          <textarea
            ref={textareaRef}
            value={inputs[step.id] ?? ''}
            onChange={e => setInputs(p => ({ ...p, [step.id]: e.target.value }))}
            onKeyDown={handleCollectKeyDown}
            placeholder={step.placeholder}
            rows={5}
            className="input w-full bg-gray-900/60 border-gray-800 focus:border-blue-500/50 text-sm p-4 resize-none"
          />

          <div className="space-y-1.5">
            <p className="text-xs text-gray-600 uppercase tracking-wide">Examples — click to use</p>
            {step.examples.map((ex, i) => (
              <button
                key={i}
                onClick={() => setInputs(p => ({ ...p, [step.id]: ex }))}
                className="w-full text-left text-xs text-gray-500 hover:text-gray-300 bg-gray-900/40 hover:bg-gray-800/60 border border-gray-800 hover:border-gray-700 rounded-lg px-3 py-2 transition-all whitespace-pre-line"
              >
                {ex}
              </button>
            ))}
          </div>

          {currentStep > 0 && (
            <div className="border-t border-gray-800 pt-3 space-y-1">
              {STEPS.slice(0, currentStep).map(s => (
                <div key={s.id} className="flex items-center gap-2 text-xs text-gray-600">
                  <CheckCircle2 size={12} className={inputs[s.id]?.trim() ? 'text-emerald-600' : 'text-gray-700'} />
                  <span>{s.title}</span>
                  {!inputs[s.id]?.trim() && <span className="text-gray-700">· skipped</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 p-4 border-t border-gray-800 flex items-center justify-between gap-3">
          {step.optional ? (
            <button
              onClick={() => advanceStep(true)}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              <SkipForward size={14} /> Skip
            </button>
          ) : <div />}
          <button
            onClick={() => advanceStep()}
            disabled={!inputs[step.id]?.trim() && !step.optional}
            className="btn-primary flex items-center gap-2 px-6 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>{currentStep < STEPS.length - 1 ? 'Continue' : 'Next: Constraints'}</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
