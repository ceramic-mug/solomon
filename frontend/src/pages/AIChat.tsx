import { useState, useRef, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getPlan } from '../api/client'
import { Send, Wrench, Bot, User, Loader2 } from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  toolCalls?: ToolCall[]
}

interface ToolCall {
  tool: string
  params?: Record<string, unknown>
  result?: string
}

// Parse an SSE line stream and yield events
async function* sseStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim()
        if (data && data !== '[DONE]') yield data
      }
    }
  }
}

function ToolCallBadge({ tc }: { tc: ToolCall }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="text-xs border border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 bg-gray-800/60 text-gray-400 hover:text-gray-200 text-left transition-colors"
      >
        <Wrench size={12} />
        <span className="font-mono">{tc.tool}</span>
        {tc.result ? <span className="ml-auto text-emerald-500">✓</span> : <Loader2 size={11} className="ml-auto animate-spin" />}
      </button>
      {open && tc.result && (
        <pre className="px-3 py-2 text-gray-500 font-mono text-[11px] overflow-x-auto bg-gray-900/50 border-t border-gray-700">
          {tc.result}
        </pre>
      )}
    </div>
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
        isUser ? 'bg-blue-600' : 'bg-gray-700'
      }`}>
        {isUser ? <User size={14} className="text-white" /> : <Bot size={14} className="text-gray-300" />}
      </div>
      <div className={`flex-1 space-y-2 max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        {(msg.toolCalls ?? []).map((tc, i) => <ToolCallBadge key={i} tc={tc} />)}
        {msg.text && (
          <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-blue-600 text-white rounded-tr-sm'
              : 'bg-gray-800 text-gray-200 rounded-tl-sm'
          }`}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  )
}

export default function AIChat() {
  const { id: planId } = useParams<{ id: string }>()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { data: plan } = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => getPlan(planId!),
    enabled: !!planId,
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || streaming || !planId) return

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', text: input.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setStreaming(true)

    const assistantId = crypto.randomUUID()
    const assistantMsg: Message = { id: assistantId, role: 'assistant', text: '', toolCalls: [] }
    setMessages(prev => [...prev, assistantMsg])

    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch('/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ plan_id: planId, message: userMsg.text }),
      })

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => 'Unknown error')
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, text: `Error: ${errText}` } : m
        ))
        return
      }

      for await (const raw of sseStream(res.body)) {
        try {
          const evt = JSON.parse(raw) as {
            type: 'tool_call' | 'tool_result' | 'message' | 'done'
            tool?: string
            params?: Record<string, unknown>
            result?: string
            text?: string
          }
          setMessages(prev => prev.map(m => {
            if (m.id !== assistantId) return m
            if (evt.type === 'tool_call') {
              return { ...m, toolCalls: [...(m.toolCalls ?? []), { tool: evt.tool ?? '', params: evt.params }] }
            }
            if (evt.type === 'tool_result') {
              const calls = (m.toolCalls ?? []).slice()
              const last = calls.length - 1
              if (last >= 0) calls[last] = { ...calls[last], result: JSON.stringify(evt.result, null, 2) }
              return { ...m, toolCalls: calls }
            }
            if (evt.type === 'message') {
              return { ...m, text: m.text + (evt.text ?? '') }
            }
            return m
          }))
        } catch { /* ignore parse errors */ }
      }
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, text: `Connection error: ${String(err)}` } : m
      ))
    } finally {
      setStreaming(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const examplePrompts = [
    'What if I have a kid in my third year of residency?',
    'Compare PSLF vs aggressive payoff for my student loans',
    'What happens to my net worth if I moonlight $2,000/mo starting in year 2?',
    'Model the attending income transition in month 36',
  ]

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800 flex-shrink-0">
        <h1 className="text-lg font-semibold text-white flex items-center gap-2">
          <Bot size={20} className="text-blue-400" />
          AI Financial Advisor
        </h1>
        {plan && <p className="text-gray-500 text-sm mt-0.5">Analyzing: {plan.name}</p>}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-4">
            <p className="text-gray-500 text-sm text-center pt-8">
              Ask me anything about your financial plan. I can create scenario forks, model life events, and compare outcomes.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl mx-auto">
              {examplePrompts.map(p => (
                <button
                  key={p}
                  onClick={() => { setInput(p); textareaRef.current?.focus() }}
                  className="text-left px-4 py-3 rounded-lg border border-gray-800 bg-gray-900 text-gray-400 text-xs hover:border-gray-700 hover:text-gray-200 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-gray-800 flex-shrink-0">
        <div className="flex gap-3 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your financial plan… (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="input flex-1 resize-none min-h-[42px] max-h-32 py-2.5"
            style={{ overflow: 'hidden' }}
            onInput={e => {
              const t = e.currentTarget
              t.style.height = 'auto'
              t.style.height = Math.min(t.scrollHeight, 128) + 'px'
            }}
            disabled={streaming}
          />
          <button
            onClick={sendMessage}
            disabled={streaming || !input.trim()}
            className="btn-primary p-2.5 flex-shrink-0 disabled:opacity-40"
          >
            {streaming ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-2">Powered by Gemini 2.0 Flash · Solomon MCP tools</p>
      </div>
    </div>
  )
}
