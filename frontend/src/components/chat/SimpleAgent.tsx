import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Send, Loader2, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react'

interface ToolEvent {
  tool: string
  status: 'running' | 'done'
}

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
  modify_income: 'Updated income',
  modify_expense: 'Updated expense',
  modify_debt: 'Updated debt',
  modify_investment: 'Updated investment',
  delete_income: 'Removed income',
  delete_expense: 'Removed expense',
  delete_debt: 'Removed debt',
  delete_investment: 'Removed investment',
  create_fork: 'Plan fork',
}

export default function SimpleAgent({ planId }: { planId: string }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [liveTools, setLiveTools] = useState<ToolEvent[]>([])
  const [appliedCount, setAppliedCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const qc = useQueryClient()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [input])

  const handleSend = async () => {
    if (!input.trim() || loading) return
    setLoading(true)
    setLiveTools([])
    setAppliedCount(null)
    setError(null)
    const message = input.trim()
    setInput('')

    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch('/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          plan_id: planId,
          message: 'Use tool calls to apply this directly to the plan, do not ask for confirmation: ' + message,
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Request failed (${res.status})`)
      }

      if (res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (!data || data === '[DONE]') continue
            try {
              const evt = JSON.parse(data)
              if (evt.type === 'tool_call') {
                setLiveTools(prev => [...prev, { tool: evt.tool, status: 'running' }])
              } else if (evt.type === 'tool_result') {
                setLiveTools(prev => {
                  const next = [...prev]
                  // find last running instance of this tool
                  let idx = -1
                  for (let j = next.length - 1; j >= 0; j--) {
                    if (next[j].tool === evt.tool && next[j].status === 'running') { idx = j; break }
                  }
                  if (idx >= 0) next[idx] = { tool: evt.tool, status: 'done' }
                  return next
                })
              }
            } catch {
              // non-JSON SSE line, ignore
            }
          }
        }
      }

      setLiveTools(prev => {
        const count = prev.filter(t => t.status === 'done').length
        setAppliedCount(count)
        return prev
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      await qc.invalidateQueries({ queryKey: ['plan', planId] })
      await qc.invalidateQueries({ queryKey: ['simulate', planId] })
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const doneTools = liveTools.filter(t => t.status === 'done')
  const runningTools = liveTools.filter(t => t.status === 'running')

  return (
    <div className="card bg-blue-900/10 border-blue-800/30 p-4">
      <div className="flex items-center gap-2 mb-2 text-blue-400">
        <Sparkles size={15} />
        <h3 className="font-medium text-sm">Natural Language Builder</h3>
        <span className="ml-auto text-[10px] text-blue-400/50">Enter to send · Shift+Enter for new line</span>
      </div>
      <p className="text-xs text-blue-200/50 mb-3 leading-relaxed">
        Describe your financial situation or any change — income, debts, expenses, PSLF status, life events — and it'll be applied to your plan.
      </p>

      {/* Live tool feed */}
      {liveTools.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {liveTools.map((t, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all ${
                t.status === 'running'
                  ? 'bg-blue-500/15 text-blue-300 border border-blue-500/25'
                  : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
              }`}
            >
              {t.status === 'running'
                ? <Loader2 size={10} className="animate-spin" />
                : <CheckCircle2 size={10} />
              }
              {TOOL_LABELS[t.tool] ?? t.tool}
            </span>
          ))}
        </div>
      )}

      {/* Done summary */}
      {!loading && appliedCount !== null && runningTools.length === 0 && (
        <div className="mb-3 flex items-center gap-1.5 text-xs text-emerald-400/90">
          <CheckCircle2 size={12} className="shrink-0" />
          <span>
            Applied {doneTools.length} change{doneTools.length !== 1 ? 's' : ''} · simulation updated
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-3 flex items-start gap-1.5 text-xs text-red-400/90">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          className="input flex-1 bg-gray-900/50 border-gray-800 focus:border-blue-500/50 text-sm resize-none overflow-hidden leading-relaxed"
          style={{ minHeight: 42, maxHeight: 180 }}
          placeholder='e.g. "I make $70k as a resident starting July 2026, have $250k in med school loans at 6.5% on PSLF/SAVE, paying about $300/mo IDR, rent is $1,400/mo, and I have a 403b with 4% employer match..."'
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          rows={1}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="btn-primary px-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white shrink-0"
          style={{ height: 42 }}
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>
    </div>
  )
}
