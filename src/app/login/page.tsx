'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#191919]">
      <div className="w-full max-w-sm">
        {/* Logo / brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-card bg-accent mb-4">
            <span className="text-white font-bold text-xl">M</span>
          </div>
          <h1 className="text-xl font-semibold text-[#e8e8e8]">Matoh Media Group</h1>
          <p className="text-[#888] text-sm mt-1">Sign in to your account</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[#888] mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-card bg-[#202020] border border-[#2e2e2e] text-[#e8e8e8] text-sm placeholder-[#555] focus:outline-none focus:border-[#4f8ef7] transition-colors"
              placeholder="you@matoh.media"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[#888] mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-card bg-[#202020] border border-[#2e2e2e] text-[#e8e8e8] text-sm placeholder-[#555] focus:outline-none focus:border-[#4f8ef7] transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-chip px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-card bg-[#4f8ef7] hover:bg-[#3a7de8] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors mt-2"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
