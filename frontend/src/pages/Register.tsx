import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { register } from '../api/client'
import { useAuthStore } from '../store/auth'
import { Coins, Loader2 } from 'lucide-react'

// Ask the backend to look up state income tax via Gemini.
// Returns a flat marginal rate (e.g. 5.0 for 5%) or null on failure.
async function fetchStateTax(stateCode: string): Promise<number | null> {
  try {
    const res = await fetch(`/ai/state-tax?state=${encodeURIComponent(stateCode.toUpperCase())}`)
    if (!res.ok) return null
    const data = await res.json() as { rate: number }
    return data.rate
  } catch {
    return null
  }
}

export default function Register() {
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const [form, setForm] = useState({ name: '', email: '', password: '', state_code: '', state_tax: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [taxLookupState, setTaxLookupState] = useState<'idle' | 'loading' | 'done'>('idle')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  // Auto-fill state tax when a valid 2-letter code is entered
  useEffect(() => {
    const code = form.state_code.trim()
    if (code.length !== 2) {
      setTaxLookupState('idle')
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setTaxLookupState('loading')
      const rate = await fetchStateTax(code)
      if (rate !== null) {
        setForm(f => ({ ...f, state_tax: rate.toFixed(2) }))
        setTaxLookupState('done')
      } else {
        setTaxLookupState('idle')
      }
    }, 600)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [form.state_code])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await register(
        form.email,
        form.password,
        form.name,
        form.state_code.toUpperCase(),
        parseFloat(form.state_tax || '0') / 100,
      )
      setAuth(res.user, res.access_token, res.refresh_token)
      navigate('/')
    } catch {
      setError('Registration failed. Email may already be in use.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mb-4">
            <Coins size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Solomon</h1>
          <p className="text-gray-500 text-sm mt-1">Your financial sandbox</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <h2 className="text-lg font-semibold text-white">Create account</h2>

          {error && <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>}

          <div>
            <label className="label">Name</label>
            <input type="text" className="input w-full" placeholder="Name" value={form.name} onChange={set('name')} required />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input w-full" placeholder="you@example.com" value={form.email} onChange={set('email')} required />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" className="input w-full" placeholder="Min 8 characters" value={form.password} onChange={set('password')} minLength={8} required />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="label">State</label>
              <input
                type="text"
                className="input w-full uppercase"
                placeholder="WV"
                maxLength={2}
                value={form.state_code}
                onChange={set('state_code')}
              />
            </div>
            <div className="flex-1">
              <label className="label flex items-center gap-1.5">
                State income tax %
                {taxLookupState === 'loading' && <Loader2 size={11} className="animate-spin text-blue-400" />}
                {taxLookupState === 'done' && <span className="text-emerald-500 text-xs">auto-filled</span>}
              </label>
              <input
                type="number"
                className="input w-full"
                placeholder="auto"
                step="0.01"
                min="0"
                max="15"
                value={form.state_tax}
                onChange={set('state_tax')}
              />
            </div>
          </div>
          <p className="text-xs text-gray-600 -mt-2">
            Used in simulation as a flat rate on taxable income. You can update this in settings anytime.
          </p>

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>

          <p className="text-center text-sm text-gray-500">
            Have an account?{' '}
            <Link to="/login" className="text-blue-400 hover:text-blue-300">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
