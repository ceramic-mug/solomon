import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { register } from '../api/client'
import { useAuthStore } from '../store/auth'
import { Coins } from 'lucide-react'

export default function Register() {
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const [form, setForm] = useState({ name: '', email: '', password: '', state_code: '', state_tax: '0' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await register(
        form.email,
        form.password,
        form.name,
        form.state_code,
        parseFloat(form.state_tax) / 100,
      )
      setAuth(res.user, res.access_token)
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
            <label className="label">Your name</label>
            <input type="text" className="input w-full" placeholder="Joshua & Sarah" value={form.name} onChange={set('name')} required />
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
              <input type="text" className="input w-full uppercase" placeholder="TX" maxLength={2} value={form.state_code} onChange={set('state_code')} />
            </div>
            <div className="flex-1">
              <label className="label">State tax %</label>
              <input type="number" className="input w-full" placeholder="0" step="0.1" min="0" max="15" value={form.state_tax} onChange={set('state_tax')} />
            </div>
          </div>

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
