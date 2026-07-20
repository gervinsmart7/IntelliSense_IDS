import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, CheckCircle, Eye, EyeOff, Mail } from 'lucide-react'
import { orgAPI } from '../../services/api'
import api from '../../services/api'
import toast from 'react-hot-toast'

const STEPS = ['Organisation Details', 'Account Details', 'Verify Email']

const ORG_TYPES = [
  'Commercial Bank',
  'Investment Bank',
  'Microfinance Institution',
  'Insurance Company',
  'Pension Fund',
  'Savings and Loans',
  'Fintech Company',
  'Payment Service Provider',
  'Central Bank',
  'Credit Union',
  'Forex Bureau',
  'Securities Firm',
  'Mobile Money Operator'
]

const COUNTRIES = [
  'Ghana', 'Nigeria', 'Kenya', 'South Africa',
  'United Kingdom', 'United States', 'Canada',
  'Germany', 'France', 'Other'
]

function Register() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Email verification state
  const [verificationToken, setVerificationToken] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  const [form, setForm] = useState({
    name: '',
    type: '',
    country: '',
    city: '',
    domain: '',
    phone: '',
    admin_name: '',
    admin_email: '',
    password: '',
    confirm_password: ''
  })

  function handleChange(key, value) {
    setForm(function(prev) { return { ...prev, [key]: value } })
  }

  function validateStep1() {
    if (!form.name) { toast.error('Organisation name is required'); return false }
    if (!form.type) { toast.error('Organisation type is required'); return false }
    if (!form.country) { toast.error('Country is required'); return false }
    if (!form.city) { toast.error('City is required'); return false }
    if (!form.domain) { toast.error('Domain is required'); return false }
    return true
  }

  function validateStep2() {
    if (!form.admin_name) { toast.error('Admin name is required'); return false }
    if (!form.admin_email) { toast.error('Email is required'); return false }
    if (!/\S+@\S+\.\S+/.test(form.admin_email)) {
      toast.error('Please enter a valid email address')
      return false
    }
    if (!form.phone) { toast.error('Phone number is required'); return false }
    if (!form.password) { toast.error('Password is required'); return false }
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return false
    }
    if (form.password !== form.confirm_password) {
      toast.error('Passwords do not match')
      return false
    }
    return true
  }

  async function handleRegister() {
    setLoading(true)
    try {
      await orgAPI.register({
        name: form.name,
        type: form.type,
        country: form.country,
        city: form.city,
        domain: form.domain,
        phone: form.phone,
        admin_name: form.admin_name,
        admin_email: form.admin_email,
        password: form.password
      })
      setStep(2)
      toast.success('Registration successful — check your email for the code')
    } catch(e) {
      toast.error(e.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyToken() {
    if (verificationToken.length !== 6) return
    setVerifying(true)
    try {
      const res = await api.post('/api/organisations/verify-sms', {
        token: verificationToken,
        email: form.admin_email
      })
      if (res.data.status === 'success') {
        toast.success('Account verified! Check your email for your API key.')
        navigate('/login')
      }
    } catch(e) {
      const msg = e.response?.data?.detail || 'Invalid code. Please try again.'
      toast.error(msg)
      setVerificationToken('')
    } finally {
      setVerifying(false)
    }
  }

  async function handleResendCode() {
    if (resendCooldown > 0 || resending) return
    setResending(true)
    try {
      await api.post('/api/organisations/resend-sms', {
        email: form.admin_email
      })
      toast.success('New code sent to ' + form.admin_email)
      setResendCooldown(60)
      const timer = setInterval(function() {
        setResendCooldown(function(prev) {
          if (prev <= 1) {
            clearInterval(timer)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch(e) {
      toast.error('Failed to resend code')
    } finally {
      setResending(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 16px'
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px' }}>
        <div style={{
          width: '40px', height: '40px',
          background: 'var(--accent)',
          borderRadius: '10px',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Shield size={20} color="white" />
        </div>
        <div>
          <p style={{ fontWeight: '700', fontSize: '16px', color: 'var(--text-primary)' }}>
            IntelliSense IDS
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Register your financial institution
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '32px' }}>
        {STEPS.map(function(label, i) {
          const isComplete = step > i
          const isActive = step === i
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '28px', height: '28px',
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: '600',
                  background: isComplete
                    ? 'var(--success)'
                    : isActive
                    ? 'var(--accent)'
                    : 'var(--bg-elevated)',
                  color: isComplete || isActive ? 'white' : 'var(--text-muted)',
                  transition: 'all 0.2s ease',
                  flexShrink: 0
                }}>
                  {isComplete ? <CheckCircle size={14} /> : i + 1}
                </div>
                <span style={{
                  fontSize: '12px',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)'
                }}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{
                  width: '24px', height: '1px',
                  background: step > i ? 'var(--success)' : 'var(--border)'
                }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Card */}
      <div className="card" style={{ width: '100%', maxWidth: '480px' }}>

        {/* ─────────────────────────────────────────
            STEP 0 — Organisation Details
        ───────────────────────────────────────── */}
        {step === 0 && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', marginBottom: '4px' }}>
              Organisation Details
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>
              Tell us about your financial institution
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Institution Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={function(e) { handleChange('name', e.target.value) }}
                  placeholder="e.g. GCB Bank"
                  className="input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    Type
                  </label>
                  <select
                    value={form.type}
                    onChange={function(e) { handleChange('type', e.target.value) }}
                    className="input"
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="">Select type</option>
                    {ORG_TYPES.map(function(t) {
                      return <option key={t} value={t}>{t}</option>
                    })}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    Country
                  </label>
                  <select
                    value={form.country}
                    onChange={function(e) { handleChange('country', e.target.value) }}
                    className="input"
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="">Select country</option>
                    {COUNTRIES.map(function(c) {
                      return <option key={c} value={c}>{c}</option>
                    })}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    City
                  </label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={function(e) { handleChange('city', e.target.value) }}
                    placeholder="e.g. Accra"
                    className="input"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    Domain
                  </label>
                  <input
                    type="text"
                    value={form.domain}
                    onChange={function(e) { handleChange('domain', e.target.value) }}
                    placeholder="e.g. gcb.com.gh"
                    className="input"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={function() { if (validateStep1()) setStep(1) }}
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: '24px' }}
            >
              Continue
            </button>

            <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)', marginTop: '16px' }}>
              Already registered?{' '}
              <a href="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                Sign in
              </a>
            </p>
          </div>
        )}

        {/* ─────────────────────────────────────────
            STEP 1 — Account Details
        ───────────────────────────────────────── */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', marginBottom: '4px' }}>
              Account Details
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>
              Create your administrator account
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  value={form.admin_name}
                  onChange={function(e) { handleChange('admin_name', e.target.value) }}
                  placeholder="e.g. Kwame Mensah"
                  className="input"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={form.admin_email}
                  onChange={function(e) { handleChange('admin_email', e.target.value) }}
                  placeholder="you@organisation.com"
                  className="input"
                />
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  A 6-digit verification code will be sent to this email
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={function(e) { handleChange('phone', e.target.value) }}
                  placeholder="+233 24 000 0000"
                  className="input"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={function(e) { handleChange('password', e.target.value) }}
                    placeholder="Minimum 8 characters"
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
                      display: 'flex'
                    }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={form.confirm_password}
                  onChange={function(e) { handleChange('confirm_password', e.target.value) }}
                  placeholder="Repeat your password"
                  className="input"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '24px' }}>
              <button
                onClick={function() { setStep(0) }}
                className="btn-secondary"
                style={{ justifyContent: 'center', padding: '12px' }}
              >
                Back
              </button>
              <button
                onClick={function() { if (validateStep2()) handleRegister() }}
                disabled={loading}
                className="btn-primary"
                style={{ justifyContent: 'center', padding: '12px' }}
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────
            STEP 2 — Email Verification
        ───────────────────────────────────────── */}
        {step === 2 && (
          <div>
            {/* Icon and heading */}
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <div style={{
                width: '72px', height: '72px',
                background: 'rgba(99,102,241,0.1)',
                border: '2px solid rgba(99,102,241,0.2)',
                borderRadius: '50%',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <Mail size={32} color="var(--accent)" />
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', marginBottom: '8px' }}>
                Verify Your Email
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '6px' }}>
                We sent a 6-digit verification code to
              </p>
              <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
                {form.admin_email}
              </p>
            </div>

            {/* Info box */}
            <div style={{
              padding: '12px 16px',
              background: 'rgba(99,102,241,0.06)',
              border: '1px solid rgba(99,102,241,0.15)',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                Check your inbox and spam folder. The code arrives within 1 minute. It expires in 24 hours.
              </p>
            </div>

            {/* Token input */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block', fontSize: '11px',
                fontWeight: '600', textTransform: 'uppercase',
                letterSpacing: '0.05em', color: 'var(--text-muted)',
                marginBottom: '8px', textAlign: 'center'
              }}>
                Enter 6-Digit Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={verificationToken}
                onChange={function(e) {
                  const val = e.target.value.replace(/\D/g, '')
                  setVerificationToken(val)
                }}
                placeholder="000000"
                autoFocus
                style={{
                  width: '100%',
                  padding: '16px',
                  background: 'var(--bg-elevated)',
                  border: '2px solid ' + (
                    verificationToken.length === 6
                      ? 'var(--accent)'
                      : 'var(--border)'
                  ),
                  borderRadius: '10px',
                  color: 'var(--text-primary)',
                  fontSize: '32px',
                  fontWeight: '700',
                  fontFamily: 'JetBrains Mono, monospace',
                  textAlign: 'center',
                  letterSpacing: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s ease',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Verify button */}
            <button
              onClick={handleVerifyToken}
              disabled={verificationToken.length !== 6 || verifying}
              className="btn-primary"
              style={{
                width: '100%', padding: '14px',
                fontSize: '15px', marginBottom: '16px',
                justifyContent: 'center',
                opacity: verificationToken.length !== 6 ? 0.5 : 1,
                cursor: verificationToken.length !== 6
                  ? 'not-allowed' : 'pointer'
              }}
            >
              {verifying ? 'Verifying...' : 'Verify Account'}
            </button>

            {/* Resend */}
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Didn't receive the code?
              </p>
              <button
                onClick={handleResendCode}
                disabled={resendCooldown > 0 || resending}
                style={{
                  background: 'none', border: 'none',
                  color: resendCooldown > 0
                    ? 'var(--text-muted)'
                    : 'var(--accent)',
                  fontSize: '13px', fontWeight: '600',
                  cursor: resendCooldown > 0
                    ? 'not-allowed' : 'pointer',
                  padding: '4px'
                }}
              >
                {resending
                  ? 'Sending...'
                  : resendCooldown > 0
                    ? 'Resend in ' + resendCooldown + 's'
                    : 'Resend Code'
                }
              </button>
            </div>

            {/* Wrong email — go back */}
            <div style={{
              padding: '12px 16px',
              background: 'var(--bg-elevated)',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                Wrong email address?{' '}
                <button
                  onClick={function() {
                    setVerificationToken('')
                    setResendCooldown(0)
                    setStep(1)
                  }}
                  style={{
                    background: 'none', border: 'none',
                    color: 'var(--accent)', fontSize: '12px',
                    fontWeight: '600', cursor: 'pointer', padding: '0'
                  }}
                >
                  Go back and correct it
                </button>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Register