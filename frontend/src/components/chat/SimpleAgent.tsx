import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Send, Loader2, Sparkles } from 'lucide-react'

// Simple AI input for natural language onboarding
export default function SimpleAgent({ planId }: { planId: string }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const qc = useQueryClient()

  const handleSend = async () => {
    if (!input.trim() || loading) return
    setLoading(true)
    const message = input
    setInput('')
    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch('/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ plan_id: planId, message: "Use tool calls to apply this directly to the plan, do not ask for confirmation: " + message }),
      })
      // wait for stream to finish
      if (res.body) {
        const reader = res.body.getReader()
        while (true) {
          const { done } = await reader.read()
          if (done) break
        }
      }
    } finally {
      // Invalidate to fetch new plan details
      await qc.invalidateQueries({ queryKey: ['plan', planId] })
      await qc.invalidateQueries({ queryKey: ['simulate', planId] })
      setLoading(false)
    }
  }

  return (
    <div className="card bg-blue-900/10 border-blue-800/30 p-4">
      <div className="flex items-center gap-2 mb-3 text-blue-400">
        <Sparkles size={16} />
        <h3 className="font-medium text-sm">Natural Language Builder</h3>
      </div>
      <p className="text-xs text-blue-200/60 mb-3">
        Describe your situation in plain English to quickly build your plan. Example: "I make $70k as a resident, and have $200k in med school debt at 6%."
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          className="input flex-1 bg-gray-900/50 border-gray-800 focus:border-blue-500/50 text-sm"
          placeholder="I have a $1,500/mo rent expense..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          disabled={loading}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="btn-primary px-3 bg-blue-600 hover:bg-blue-500 text-white"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  )
}
