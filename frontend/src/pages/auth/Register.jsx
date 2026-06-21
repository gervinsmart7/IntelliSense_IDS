import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, CheckCircle, Eye, EyeOff, Mail } from 'lucide-react'
import { orgAPI } from '../../services/api'
import toast from 'react-hot-toast'

const STEPS = ['Organisation Details', 'Account Details', 'Check Your Email']

const ORG_TYPES = [
  'Financial', 'Healthcare', 'Education',
  'Government', 'Technology', 'Retail',
  'Manufacturing', 'Other'
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
  const [registeredEmail, setRegisteredEmail] = useState('')

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
    if (!form.phone) { toast.error('Phone number is required'); return false }
    if (!form.password) { toast.error('Password is required'); return false }
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return false }
    if (form.password !== form.confirm_password) { toast.error('Passwords do not match'); return false }
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
      setRegisteredEmail(form.admin_email)
      setStep(2)
      toast.success('Registration successful — check your email')
    } catch(e) {
      toast.error(e.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
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
            Register your organisation
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
                  transition: 'all 0.2s ease', flexShrink: 0
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

        {/* Step 0 — Organisation Details */}
        {step === 0 && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', marginBottom: '4px' }}>
              Organisation Details
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>
              Tell us about your organisation
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Organisation Name
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

        {/* Step 1 — Account Details */}
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
                  A verification link will be sent to this email
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
                  placeholder="e.g. +233 24 000 0000"
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
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
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

        {/* Step 2 — Check Email */}
        {step === 2 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '72px', height: '72px',
              background: 'rgba(99,102,241,0.1)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px'
            }}>
              <Mail size={36} color="var(--accent)" />
            </div>

            <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', marginBottom: '8px' }}>
              Check your email
            </h2>

            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.6 }}>
              We have sent a verification link to
            </p>

            <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--accent)', marginBottom: '24px' }}>
              {registeredEmail}
            </p>

            <div style={{
              padding: '14px 16px',
              background: 'var(--bg-elevated)',
              borderRadius: '8px',
              marginBottom: '20px',
              textAlign: 'left'
            }}>
              <p style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '600', marginBottom: '10px' }}>
                What happens next
              </p>
              {[
                'Click the verification link in your email',
                'Your account will be activated automatically',
                'Your API key will be sent to the same email',
                'Use the API key to configure your IDS agent'
              ].map(function(item, i) {
                return (
                  <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                    <div style={{
                      width: '20px', height: '20px',
                      background: 'var(--accent)',
                      borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '10px', color: 'white', fontWeight: '700',
                      flexShrink: 0
                    }}>
                      {i + 1}
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{item}</p>
                  </div>
                )
              })}
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Did not receive the email? Check your spam folder or{' '}
              <button
                onClick={function() { setStep(1) }}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px' }}
              >
                go back and try again
              </button>
            </p>

            <button
              onClick={function() { navigate('/login') }}
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
            >
              Go to Login
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Register
