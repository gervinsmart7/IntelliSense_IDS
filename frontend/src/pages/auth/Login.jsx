import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Eye, EyeOff } from 'lucide-react'
import { authAPI } from '../../services/api'
import useAuthStore from '../../store/useAuthStore'
import toast from 'react-hot-toast'
import ThemeToggle from '../../components/ThemeToggle'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const navigate = useNavigate()
  const setAuth = useAuthStore(state => state.setAuth)

  async function handleLogin(e) {
    e.preventDefault()
    if (!email || !password) {
      toast.error('Please fill in all fields')
      return
    }
    setLoading(true)
    try {
      const response = await authAPI.login(email, password)
      const {
        access_token, refresh_token, role, full_name,
        email: adminEmail,
        org_id, org_code, redirect_to
      } = response.data.data

      // Persist auth state in the store
      if (setAuth) {
        setAuth(access_token, refresh_token, role, { full_name, email: adminEmail, org_id, org_code })
      }
      // Also persist immediately to localStorage to ensure API interceptor can pick up token
      try {
        localStorage.setItem('intellisense-auth', JSON.stringify({
          state: {
            token: access_token,
            refreshToken: refresh_token,
            role: role,
            admin: { full_name, email: adminEmail, org_id, org_code },
            isAuthenticated: true
          }
        }))
      } catch (e) {
        // ignore storage errors
      }
      toast.success('Welcome back, ' + full_name.split(' ')[0])
      navigate(redirect_to, { replace: true})

    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault()
    if (!forgotEmail) {
      toast.error('Please enter your email address')
      return
    }

    setForgotLoading(true)
    try {
      await authAPI.forgotPassword(forgotEmail)
      toast.success('If that account exists, a reset link has been sent to your email')
      setShowForgotPassword(false)
      setForgotEmail('')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Unable to process password reset request')
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: 'var(--bg-primary)'
    }}>

      {/* Left panel */}
      <div style={{
        width: '40%',
        background: 'var(--bg-card)',
        padding: '48px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        gap: '32px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Glow */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.15,
          background: 'radial-gradient(ellipse at 20% 50%, rgba(99,102,241,0.6) 0%, transparent 60%)',
          pointerEvents: 'none'
        }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
          <div style={{
            width: '40px', height: '40px',
            background: 'var(--accent)',
            borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Shield size={30} color="white" />
          </div>
          <div>
            <p style={{ fontWeight: '700', fontSize: '16px', color: 'var(--text-primary)' }}>
              IntelliSense IDS
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              AI/ML Network-Based Intrusion Detection System
            </p>
          </div>
        </div>

        {/* Headline */}
        <div style={{ position: 'relative' }}>
          <h1 style={{
            fontSize: '42px',
            fontWeight: '800',
            lineHeight: 1.15,
            marginBottom: '40px',
            color: 'var(--text-primary)',
            fontFamily: 'Syne, sans-serif'
          }}>
            Protect your<br />
            network.<br />
            <span style={{ color: 'var(--accent)' }}>Intelligently.</span>
          </h1>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[
              'AI/ML based threat detection',
              'Real-time traffic monitoring',
              'Automatic model updates',
              'Domain-based cross organisation threat hunting'
            ].map(function(text) {
              return (
                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '6px', height: '6px',
                    background: 'var(--accent)',
                    borderRadius: '50%', flexShrink: 0
                  }} />
                  <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                    {text}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', position: 'relative', marginTop: 'auto' }}>
          © 2026 IntelliSense IDS
        </p>
      </div>

      {/* Theme toggle top right */}
      <div style={{ position: 'absolute', top: '24px', right: '24px' }}>
        <ThemeToggle />
      </div>

      {/* Right panel */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px'
      }}>
        <div style={{ width: '100%', maxWidth: '360px' }}>
          <h2 style={{
            fontSize: '28px', fontWeight: '700',
            color: 'var(--text-primary)',
            fontFamily: 'Syne, sans-serif',
            marginBottom: '8px'
          }}>
           Welcome back
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '32px' }}>
            Sign in to your account to continue
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Email */}
            <div>
              <label style={{
                display: 'block', fontSize: '11px',
                fontWeight: '600', textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-muted)', marginBottom: '8px'
              }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={function(e) { setEmail(e.target.value) }}
                placeholder="you@example.com"
                className="input"
              />
            </div>

            {/* Password */}
            <div>
              <label style={{
                display: 'block', fontSize: '11px',
                fontWeight: '600', textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-muted)', marginBottom: '8px'
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={function(e) { setPassword(e.target.value) }}
                  placeholder="Enter your password"
                  className="input"
                  style={{ paddingRight: '40px' }}
                />
                <button
                  type="button"
                  onClick={function() { setShowPassword(!showPassword) }}
                  style={{
                    position: 'absolute', right: '12px',
                    top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none',
                    cursor: 'pointer', color: 'var(--text-muted)',
                    display: 'flex', alignItems: 'center'
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Forgot */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={function() { setShowForgotPassword(!showForgotPassword) }}
                style={{
                  background: 'none', border: 'none',
                  fontSize: '13px', color: 'var(--accent)',
                  cursor: 'pointer'
                }}
              >
                Forgot password?
              </button>
            </div>

            {showForgotPassword && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={function(e) { setForgotEmail(e.target.value) }}
                  placeholder="Enter your email"
                  className="input"
                />
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={forgotLoading}
                  className="btn-primary"
                  style={{ justifyContent: 'center', padding: '10px' }}
                >
                  {forgotLoading ? 'Sending...' : 'Send reset link'}
                </button>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{ justifyContent: 'center', padding: '12px' }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p style={{
            textAlign: 'center', fontSize: '13px',
            color: 'var(--text-muted)', marginTop: '24px'
          }}>
            New organisation?{' '}
            <a href="/register" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              Get started
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default Login
