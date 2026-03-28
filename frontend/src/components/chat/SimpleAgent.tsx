import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Send, Loader2, Sparkles, CheckCircle2 } from 'lucide-react'

export default function SimpleAgent({ planId }: { planId: string }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastApplied, setLastApplied] = useState<string | null>(null)
  const qc = useQueryClient()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea as user types
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [input])

  const handleSend = async () => {
    if (!input.trim() || loading) return
    setLoading(true)
    setLastApplied(null)
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
      if (res.body) {
        const reader = res.body.getReader()
        while (true) {
          const { done } = await reader.read()
          if (done) break
        }
      }
      setLastApplied(message)
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

      {lastApplied && !loading && (
        <div className="mb-2.5 flex items-start gap-1.5 text-xs text-emerald-400/80">
          <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
          <span className="line-clamp-2">Applied: "{lastApplied}"</span>
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
