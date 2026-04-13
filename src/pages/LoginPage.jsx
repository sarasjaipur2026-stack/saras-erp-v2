import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { Button } from '../components/ui'
import { Lock, Mail, Eye, EyeOff, ArrowRight } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const { signIn } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) { setError('Enter email and password'); return }

    setLoading(true)
    setError('')

    const { error: authErr } = await signIn(email, password)
    if (authErr) {
      setError(authErr.message || 'Login failed')
      setLoading(false)
    } else {
      toast.success('Welcome back!')
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Left branding panel - hidden on mobile */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[560px] relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900 flex-col justify-between p-12">
        {/* Decorative pattern - grid dots */}
        <div className="absolute inset-0 opacity-[0.07]" style={{
          backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
        {/* Decorative shapes */}
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-white/5 rounded-full" />
        <div className="absolute bottom-20 -left-16 w-56 h-56 bg-white/5 rounded-full" />
        <div className="absolute top-1/2 right-12 w-32 h-32 border border-white/10 rounded-2xl rotate-12" />
        <div className="absolute bottom-40 right-24 w-20 h-20 border border-white/10 rounded-xl -rotate-6" />

        {/* Top branding */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-white text-lg font-bold">
              S
            </div>
            <span className="text-white/90 text-xl font-semibold tracking-tight">sarasERP</span>
          </div>
        </div>

        {/* Center content */}
        <div className="relative z-10 -mt-12">
          <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight tracking-tight">
            Manage your
            <br />
            business with
            <br />
            <span className="text-indigo-200">confidence.</span>
          </h2>
          <p className="text-indigo-200/70 mt-5 text-[15px] leading-relaxed max-w-sm">
            Streamline operations, track orders, and grow your business with a modern ERP built for manufacturers.
          </p>
        </div>

        {/* Bottom */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              <div className="w-8 h-8 rounded-full bg-indigo-400/40 border-2 border-indigo-700 flex items-center justify-center text-[10px] font-bold text-white">R</div>
              <div className="w-8 h-8 rounded-full bg-indigo-400/40 border-2 border-indigo-700 flex items-center justify-center text-[10px] font-bold text-white">S</div>
              <div className="w-8 h-8 rounded-full bg-indigo-400/40 border-2 border-indigo-700 flex items-center justify-center text-[10px] font-bold text-white">A</div>
            </div>
            <p className="text-indigo-300/70 text-xs">Trusted by your team</p>
          </div>
        </div>
      </div>

      {/* Right login form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-[400px]">
          {/* Logo - visible on all screens */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white text-xl font-bold mx-auto mb-4 shadow-lg shadow-indigo-500/25">
              S
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome back</h1>
            <p className="text-sm text-slate-500 mt-1.5">Sign in to your sarasERP account</p>
          </div>

          {/* Form card */}
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200/60 p-7 space-y-5">
            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100 font-medium">
                {error}
              </div>
            )}

            {/* Email field */}
            <div>
              <label htmlFor="login-email" className="block text-[13px] font-medium text-slate-700 mb-1.5">
                Email address
              </label>
              <div className="relative group">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-500" />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full pl-11 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all placeholder:text-slate-400"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password field */}
            <div>
              <label htmlFor="login-password" className="block text-[13px] font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative group">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-500" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-11 pr-11 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all placeholder:text-slate-400"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-0.5 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <Button type="submit" loading={loading} className="w-full" size="lg">
              Sign In
              <ArrowRight size={15} />
            </Button>
          </form>

          <p className="text-xs text-slate-400 text-center mt-6">
            Contact your administrator to get login credentials
          </p>
        </div>
      </div>
    </div>
  )
}
