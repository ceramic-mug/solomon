import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Send, Loader2, Bot, Sparkles, CheckCircle2, X, ChevronRight, Target, Calculator } from 'lucide-react'

interface WizardStep {
  id: string
  question: string
  hint: string
  placeholder: string
}

const STEPS: WizardStep[] = [
  {
    id: 'income',
    question: "Let's start with your income. What's your current role and monthly gross salary?",
    hint: "e.g. 'I'm a PGY-2 resident making $5,800/mo' or 'I just started as an attending making $32k/mo'",
    placeholder: "Tell me about your income..."
  },
  {
    id: 'debts',
    question: "How about your student loans or other debts?",
    hint: "e.g. '$220k in student loans at 6.8%, on SAVE plan' or 'I have a $450k mortgage at 4.5%'",
    placeholder: "Tell me about your debts..."
  },
  {
    id: 'savings',
    question: "What are your current savings and retirement goals?",
    hint: "e.g. '$15k in a 403b, $5k in HSA, want to save $2k/mo for a down payment'",
    placeholder: "Tell me about your savings and goals..."
  },
  {
    id: 'retirement',
    question: "Finally, what's your target retirement age or net worth goal?",
    hint: "e.g. 'I want to retire at 55 with $4M' or 'I want to be debt-free in 10 years'",
    placeholder: "Tell me about your long-term goals..."
  }
]

export default function PlanBuilderWizard({ planId, onClose }: { planId: string, onClose: () => void }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [completed, setCompleted] = useState<string[]>([])
  const qc = useQueryClient()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const step = STEPS[currentStep]

  useEffect(() => {
    textareaRef.current?.focus()
  }, [currentStep])

  const handleSend = async () => {
    if (!input.trim() || loading) return
    setLoading(true)
    const message = input.trim()
    
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
          message: `The user is in the onboarding wizard step "${step.id}". Apply this information to the plan using tool calls: ${message}`,
        }),
      })
      
      // Consume the stream (we don't show the full chat here, just the progress)
      if (res.body) {
        const reader = res.body.getReader()
        while (true) {
          const { done } = await reader.read()
          if (done) break
        }
      }

      setCompleted(prev => [...prev, step.id])
      setInput('')
      
      if (currentStep < STEPS.length - 1) {
        setCurrentStep(prev => prev + 1)
      } else {
        // All steps done!
        await qc.invalidateQueries({ queryKey: ['plan', planId] })
        await qc.invalidateQueries({ queryKey: ['simulate', planId] })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (completed.length === STEPS.length) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
        <div className="card w-full max-w-lg text-center space-y-6 py-12">
          <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={40} className="text-emerald-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">Plan Built Successfully!</h2>
            <p className="text-gray-400">Your financial model has been updated with all your details.</p>
          </div>
          <button onClick={onClose} className="btn-primary px-8">
            Take me to the Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="card w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex items-center justify-between bg-gray-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-white">Solomon Plan Builder</h2>
              <p className="text-xs text-gray-500">Step {currentStep + 1} of {STEPS.length}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-800">
          <div 
            className="h-full bg-blue-500 transition-all duration-500" 
            style={{ width: `${((currentStep) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-8 flex-1 overflow-y-auto space-y-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-blue-400 text-sm font-medium">
              <Bot size={16} />
              <span>SOLOMON</span>
            </div>
            <h1 className="text-2xl font-semibold text-white leading-tight">
              {step.question}
            </h1>
            <p className="text-gray-500 text-sm italic">
              {step.hint}
            </p>
          </div>

          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={step.placeholder}
              rows={4}
              className="input w-full bg-gray-900/50 border-gray-800 focus:border-blue-500/50 text-lg p-6 resize-none"
              disabled={loading}
            />
            <div className="absolute bottom-4 right-4 text-[10px] text-gray-600">
              Enter to continue
            </div>
          </div>

          <div className="flex justify-between items-center pt-4">
            <div className="flex gap-1">
              {STEPS.map((_, i) => (
                <div 
                  key={i} 
                  className={`w-2 h-2 rounded-full ${
                    i === currentStep ? 'bg-blue-500' : i < currentStep ? 'bg-emerald-500' : 'bg-gray-800'
                  }`} 
                />
              ))}
            </div>
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="btn-primary flex items-center gap-2 px-6 py-3 text-base"
            >
              {loading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Next Step
                  <ChevronRight size={20} />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="p-4 bg-gray-900/30 border-t border-gray-800 flex items-center gap-4 text-[11px] text-gray-600">
          <div className="flex items-center gap-1">
            <Calculator size={12} />
            <span>Real-time simulation</span>
          </div>
          <div className="flex items-center gap-1">
            <Target size={12} />
            <span>Goal-based optimization</span>
          </div>
        </div>
      </div>
    </div>
  )
}
